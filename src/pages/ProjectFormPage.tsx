import { useEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent, FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { createDraftProject, useApp } from '../context/AppContext'
import { extractFromUpload, formatBytes } from '../utils/format'
import { analyzeProject, jobStreamUrl, uploadProjectFile } from '../api/client'
import { IconFile, IconSpark, IconUpload } from '../components/Icons'
import { EMPTY_NOTE, NoteFields, ProjectCardFields } from '../components/ProjectCardFields'
import type { Project } from '../types'

function stageNotice(project: Project, fallback: string) {
  if (project.pipelineMessage) return project.pipelineMessage
  if (project.pipelineStage === 'converting') return 'Docling переводит документ в Markdown…'
  if (project.pipelineStage === 'extracting') return 'Qwen извлекает параметры из Markdown…'
  if (project.pipelineStage === 'done' || project.status === 'ready') {
    return 'Параметры найдены. Проверьте и поправьте при необходимости.'
  }
  return fallback
}

export function ProjectFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { projects, upsertProject, apiOnline } = useApp()
  const existing = id ? projects.find((item) => item.id === id) : undefined
  const [form, setForm] = useState<Project>(() => existing ?? createDraftProject())
  const [extracting, setExtracting] = useState(existing?.status === 'processing')
  const [extracted, setExtracted] = useState(Boolean(existing?.extractedByLlm))
  const [error, setError] = useState('')
  const [notice, setNotice] = useState(
    existing ? '' : 'Загрузите файл — Docling сделает Markdown, Qwen заполнит метрики из мастера промпта.',
  )
  const inputRef = useRef<HTMLInputElement>(null)
  const streamRef = useRef<EventSource | null>(null)
  const formIdRef = useRef(form.id)
  formIdRef.current = form.id

  useEffect(() => {
    const found = id ? projects.find((item) => item.id === id) : undefined
    setForm(found ?? createDraftProject())
    setExtracted(Boolean(found?.extractedByLlm))
    setExtracting(found?.status === 'processing')
    setError('')
    setNotice(
      found
        ? stageNotice(found, '')
        : 'Загрузите файл — Docling сделает Markdown, Qwen заполнит метрики из мастера промпта.',
    )
  }, [id])

  useEffect(() => {
    const found = projects.find((item) => item.id === formIdRef.current)
    if (!found) return
    const live = found.status === 'processing' || found.pipelineStage === 'converting' || found.pipelineStage === 'extracting'
    if (live) {
      setForm(found)
      setExtracted(Boolean(found.extractedByLlm))
      setExtracting(true)
      setNotice(stageNotice(found, ''))
      return
    }
    if (extracting && (found.status === 'ready' || found.status === 'error')) {
      setForm(found)
      setExtracting(false)
      setExtracted(Boolean(found.extractedByLlm))
      if (found.status === 'error') setError(found.pipelineMessage || 'Разбор остановился')
      else setNotice(stageNotice(found, ''))
    }
  }, [projects, extracting])

  useEffect(() => {
    return () => {
      streamRef.current?.close()
      streamRef.current = null
    }
  }, [])

  const canSubmit = Boolean(form.name.trim() && form.fileName)

  const filledCount = useMemo(() => {
    return [form.industry, form.country, form.region, form.budget != null].filter(Boolean).length
  }, [form])

  function patch<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function watchJob(jobId: string) {
    streamRef.current?.close()
    const source = new EventSource(jobStreamUrl(jobId))
    streamRef.current = source

    const onProject = (raw: string) => {
      try {
        const payload = JSON.parse(raw) as { project?: Project; message?: string }
        if (payload.project) {
          setForm(payload.project)
          setExtracted(Boolean(payload.project.extractedByLlm))
          setNotice(stageNotice(payload.project, payload.message || notice))
        } else if (payload.message) {
          setNotice(payload.message)
        }
      } catch {
        // ignore malformed frames
      }
    }

    source.addEventListener('snapshot', (event) => onProject((event as MessageEvent).data))
    source.addEventListener('progress', (event) => onProject((event as MessageEvent).data))
    source.addEventListener('done', (event) => {
      onProject((event as MessageEvent).data)
      setExtracting(false)
      setExtracted(true)
      source.close()
    })
    source.addEventListener('failed', (event) => {
      onProject((event as MessageEvent).data)
      setExtracting(false)
      try {
        const payload = JSON.parse((event as MessageEvent).data) as { message?: string }
        setError(payload.message || 'Разбор остановился')
      } catch {
        setError('Разбор остановился')
      }
      source.close()
    })
  }

  async function runExtraction(fileName: string, fileSize: number, notes = form.notes, file?: File) {
    setExtracting(true)
    setError('')
    setNotice('Файл принят. Сначала Markdown, затем извлечение параметров…')
    try {
      if (apiOnline && file) {
        await upsertProject({
          ...form,
          fileName,
          fileSize,
          notes,
          status: 'processing',
          progress: 5,
          pipelineStage: 'converting',
          updatedAt: new Date().toISOString(),
        })
        const result = await uploadProjectFile(form.id, file, notes)
        setForm(result.project)
        setNotice(stageNotice(result.project, 'Docling переводит документ в Markdown…'))
        if (result.job?.id) watchJob(result.job.id)
        return
      }
      if (apiOnline && !file) {
        const result = await analyzeProject(form.id, notes)
        setForm(result.project)
        setNotice(stageNotice(result.project, 'Повторный разбор документа…'))
        if (result.job?.id) watchJob(result.job.id)
        return
      }
      await new Promise((resolve) => setTimeout(resolve, 1400))
      const data = extractFromUpload(fileName, notes)
      setForm((prev) => ({
        ...prev,
        name: prev.name.trim() ? prev.name : data.name,
        fileName,
        fileSize,
        industry: data.industry,
        country: data.country,
        region: data.region,
        budget: data.budget,
        extractedByLlm: true,
        updatedAt: new Date().toISOString(),
      }))
      setExtracted(true)
      setNotice('Поля заполнены по файлу и пояснениям. Проверьте и поправьте, если модель ошиблась.')
      setExtracting(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось обработать файл')
      setExtracting(false)
    }
  }

  function onFile(file: File | undefined) {
    if (!file) return
    const ok = /\.(xlsx|xls|xlsm|pdf|docx|doc|csv)$/i.test(file.name)
    if (!ok) {
      setError('Нужен файл модели или ТЭО: xlsx, pdf, docx, csv.')
      return
    }
    void runExtraction(file.name, file.size, form.notes, file)
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault()
    onFile(event.dataTransfer.files[0])
  }

  async function persist(status: Project['status'] = form.status) {
    const payload = {
      ...form,
      name: form.name.trim() || 'Без названия',
      status,
      progress: status === 'processing' ? Math.max(form.progress, 8) : form.progress,
      updatedAt: new Date().toISOString(),
    }
    await upsertProject(payload)
    return payload
  }

  async function onSaveDraft(event: FormEvent) {
    event.preventDefault()
    const saved = await persist(form.status)
    navigate(`/projects/${saved.id}`)
  }

  async function onQueue() {
    if (!canSubmit) {
      setError('Чтобы отправить на расчёт, нужны название и файл проекта.')
      return
    }
    if (apiOnline) {
      setExtracting(true)
      try {
        const result = await analyzeProject(form.id, form.notes)
        setForm(result.project)
        if (result.job?.id) watchJob(result.job.id)
        navigate(`/projects/${result.project.id}`)
        return
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Не удалось запустить разбор')
        setExtracting(false)
        return
      }
    }
    const saved = await persist('processing')
    navigate(`/projects/${saved.id}`)
  }

  return (
    <section className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">
            <Link to="/">Объекты анализа</Link>
            <span> / карточка проекта</span>
          </p>
          <h1>{existing ? 'Редактирование проекта' : 'Загрузка проекта'}</h1>
          <p className="lede">
            Положите финансовую модель или ТЭО. Документ сначала станет Markdown через Docling — так сохраняются сложные
            таблицы — затем локальный Qwen в реальном времени вытаскивает метрики из мастера промпта.
          </p>
        </div>
      </div>

      <form className="split" onSubmit={onSaveDraft}>
        <div className="stack">
          <label
            className={`drop ${extracting ? 'is-busy' : ''}`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
          >
            <input
              ref={inputRef}
              type="file"
              hidden
              accept=".xlsx,.xls,.xlsm,.pdf,.docx,.doc,.csv"
              onChange={(e) => onFile(e.target.files?.[0])}
            />
            <IconUpload />
            <strong>{form.fileName ? 'Заменить файл' : 'Перетащите файл проекта'}</strong>
            <span>xlsx, pdf, docx · Docling → Markdown → Qwen сразу после загрузки</span>
            {form.fileName && (
              <em className="drop__file">
                <IconFile /> {form.fileName} · {formatBytes(form.fileSize)}
              </em>
            )}
          </label>

          {extracting && (
            <div className="banner">
              <div>
                <strong>
                  {form.pipelineStage === 'extracting' ? 'Qwen извлекает параметры' : 'Docling готовит Markdown'}
                </strong>
                <p>{form.pipelineMessage || notice}</p>
              </div>
              <div className="progress progress--wide">
                <span style={{ width: `${Math.max(form.progress, 6)}%` }} />
              </div>
              <em>{form.progress || 0}%</em>
            </div>
          )}

          {form.markdownPreview && (
            <details className="markdown-preview">
              <summary>Markdown документа</summary>
              <pre>{form.markdownPreview}</pre>
            </details>
          )}

          <button
            type="button"
            className="btn btn--ghost"
            disabled={extracting || (!form.fileName && !form.notes.trim())}
            onClick={() => void runExtraction(form.fileName ?? 'notes.txt', form.fileSize ?? 0)}
          >
            <IconSpark />
            Пересобрать поля из файла и пояснений
          </button>
        </div>

        <aside className="panel">
          <div className="panel__head">
            <h2>Поля карточки</h2>
            <span className={`pill ${extracted ? 'pill--ok' : ''}`}>
              {extracting ? 'разбор…' : extracted ? `заполнено ${filledCount}/4` : 'ожидает файл'}
            </span>
          </div>
          {notice && <p className="callout">{notice}</p>}
          {error && <p className="callout callout--danger">{error}</p>}
          <ProjectCardFields form={form} patch={patch} />
          <div className="actions">
            <button type="submit" className="btn">
              {existing ? 'Сохранить карточку' : 'Сохранить черновик'}
            </button>
            <button type="button" className="btn btn--primary" onClick={onQueue} disabled={!canSubmit || extracting}>
              Отправить на расчёт
            </button>
          </div>
        </aside>
      </form>

      <div className="panel">
        <h2>Аналитическая записка</h2>
        <NoteFields
          note={form.note ?? EMPTY_NOTE}
          onChange={(note) => setForm((prev) => ({ ...prev, note }))}
        />
      </div>
    </section>
  )
}
