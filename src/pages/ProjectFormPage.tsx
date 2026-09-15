import { useEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent, FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { createDraftProject, useApp } from '../context/AppContext'
import { extractFromUpload } from '../utils/format'
import { analyzeProject, deleteProjectDocument, jobStreamUrl, uploadProjectFiles } from '../api/client'
import { IconSpark, IconUpload } from '../components/Icons'
import { DocumentList } from '../components/DocumentList'
import { EMPTY_NOTE, NoteFields, ProjectCardFields } from '../components/ProjectCardFields'
import type { Project } from '../types'
import { projectDocuments } from '../utils/documents'
import { markdownSummary, pipelineErrorTitle } from '../utils/pipelineStatus'

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
    existing ? '' : 'Загрузите файлы — Docling сделает Markdown по каждому. Поля из всех .md собирает кнопка ниже.',
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
        : 'Загрузите файлы — Docling сделает Markdown по каждому. Поля из всех .md собирает кнопка ниже.',
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
    if (extracting) {
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

  const canSubmit = Boolean(form.name.trim() && projectDocuments(form).length)

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
      try {
        const payload = JSON.parse((event as MessageEvent).data) as { project?: Project }
        setExtracted(Boolean(payload.project?.extractedByLlm))
      } catch {
        setExtracted(Boolean(form.extractedByLlm))
      }
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

  async function attachFiles(files: File[]) {
    const accepted = files.filter((file) => /\.(xlsx|xls|xlsm|pdf|docx|doc|csv|md|txt)$/i.test(file.name))
    if (!accepted.length) {
      setError('Нужен файл модели или ТЭО: xlsx, pdf, docx, csv, md.')
      return
    }
    setExtracting(true)
    setError('')
    setNotice(
      accepted.length > 1
        ? `Принято ${accepted.length} файла. Docling готовит Markdown…`
        : 'Файл принят. Docling готовит Markdown…',
    )
    try {
      if (apiOnline) {
        await upsertProject({
          ...form,
          notes: form.notes,
          status: 'processing',
          progress: 5,
          pipelineStage: 'converting',
          updatedAt: new Date().toISOString(),
        })
        const result = await uploadProjectFiles(form.id, accepted, form.notes)
        setForm(result.project)
        setNotice(stageNotice(result.project, 'Docling переводит документы в Markdown…'))
        if (result.job?.id) watchJob(result.job.id)
        return
      }
      setForm((prev) => {
        const documents = [
          ...(prev.documents || []),
          ...accepted.map((file, index) => ({
            id: `local-${Date.now()}-${index}`,
            fileName: file.name,
            fileSize: file.size,
            markdownReady: false,
            status: 'ready' as const,
          })),
        ]
        return {
          ...prev,
          documents,
          fileName: documents[0]?.fileName ?? prev.fileName,
          fileSize: documents.reduce((sum, item) => sum + (item.fileSize || 0), 0),
          updatedAt: new Date().toISOString(),
        }
      })
      setNotice('Файлы добавлены локально. Для Markdown и Qwen нужен API.')
      setExtracting(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось обработать файл')
      setExtracting(false)
    }
  }

  async function rebuildFields() {
    setExtracting(true)
    setError('')
    setNotice('Отправляю все Markdown и пояснения в Qwen…')
    try {
      if (apiOnline) {
        const result = await analyzeProject(form.id, form.notes)
        setForm(result.project)
        setNotice(stageNotice(result.project, 'Qwen извлекает параметры…'))
        if (result.job?.id) watchJob(result.job.id)
        return
      }
      const names = projectDocuments(form).map((item) => item.fileName).join(' ')
      const data = extractFromUpload(names || 'notes.txt', form.notes)
      setForm((prev) => ({
        ...prev,
        name: prev.name.trim() ? prev.name : data.name,
        industry: data.industry,
        country: data.country,
        region: data.region,
        budget: data.budget,
        extractedByLlm: true,
        updatedAt: new Date().toISOString(),
      }))
      setExtracted(true)
      setNotice('Поля заполнены по файлам и пояснениям. Проверьте и поправьте, если модель ошиблась.')
      setExtracting(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось запустить разбор')
      setExtracting(false)
    }
  }

  async function removeDocument(docId: string) {
    try {
      if (apiOnline) {
        const next = await deleteProjectDocument(form.id, docId)
        setForm(next)
        return
      }
      setForm((prev) => ({
        ...prev,
        documents: (prev.documents || []).filter((item) => item.id !== docId),
      }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось убрать файл')
    }
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault()
    void attachFiles([...event.dataTransfer.files])
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
      setError('Чтобы отправить на расчёт, нужны название и хотя бы один файл.')
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
            Можно прикрепить несколько файлов. Каждый сначала станет Markdown через Docling. Когда все .md готовы,
            кнопка «Пересобрать поля» отправит их вместе с пояснениями в Qwen.
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
              multiple
              accept=".xlsx,.xls,.xlsm,.pdf,.docx,.doc,.csv,.md,.txt"
              onChange={(e) => {
                void attachFiles([...(e.target.files || [])])
                e.target.value = ''
              }}
            />
            <IconUpload />
            <strong>{projectDocuments(form).length ? 'Добавить ещё файлы' : 'Перетащите файлы проекта'}</strong>
            <span>xlsx, pdf, docx, csv, md · несколько файлов · Docling пишет Markdown, Qwen — по кнопке ниже</span>
          </label>

          <DocumentList project={form} onRemove={(id) => void removeDocument(id)} />

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
            <details className="markdown-preview" open={form.status === 'error'}>
              <summary>
                {markdownSummary(form)}
                {' · '}
                <a href={`/api/projects/${form.id}/markdown`} download={`${form.id}.md`}>
                  скачать все .md
                </a>
              </summary>
              <pre>{form.markdownPreview}</pre>
            </details>
          )}

          <button
            type="button"
            className="btn btn--ghost"
            disabled={extracting || !projectDocuments(form).length}
            onClick={() => void rebuildFields()}
          >
            <IconSpark />
            Пересобрать поля из файлов и пояснений
          </button>
        </div>

        <aside className="panel">
          <div className="panel__head">
            <h2>Поля карточки</h2>
            <span className={`pill ${extracted ? 'pill--ok' : ''}`}>
              {extracting ? 'разбор…' : extracted ? `заполнено ${filledCount}/4` : 'ожидает файлы'}
            </span>
          </div>
          {notice && <p className="callout">{notice}</p>}
          {error && (
            <div className="callout callout--danger">
              <strong>{pipelineErrorTitle(form)}</strong>
              <p>{error}</p>
              <p>{markdownSummary(form)}</p>
            </div>
          )}
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
