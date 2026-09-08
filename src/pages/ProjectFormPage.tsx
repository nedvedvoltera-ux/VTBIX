import { useEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent, FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { createDraftProject, useApp } from '../context/AppContext'
import { extractFromUpload, formatBytes } from '../utils/format'
import { uploadProjectFile } from '../api/client'
import { IconFile, IconSpark, IconUpload } from '../components/Icons'
import { EMPTY_NOTE, NoteFields, ProjectCardFields } from '../components/ProjectCardFields'
import type { Project } from '../types'

export function ProjectFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { projects, upsertProject, apiOnline } = useApp()
  const existing = id ? projects.find((item) => item.id === id) : undefined
  const [form, setForm] = useState<Project>(() => existing ?? createDraftProject())
  const [extracting, setExtracting] = useState(false)
  const [extracted, setExtracted] = useState(Boolean(existing?.extractedByLlm))
  const [error, setError] = useState('')
  const [notice, setNotice] = useState(existing ? '' : 'Загрузите файл — поля отрасли, локации и бюджета заполнятся автоматически.')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const found = id ? projects.find((item) => item.id === id) : undefined
    setForm(found ?? createDraftProject())
    setExtracted(Boolean(found?.extractedByLlm))
    setError('')
    setNotice(found ? '' : 'Загрузите файл — поля отрасли, локации и бюджета заполнятся автоматически.')
  }, [id])

  const canSubmit = Boolean(form.name.trim() && form.fileName)

  const filledCount = useMemo(() => {
    return [form.industry, form.country, form.region, form.budget != null].filter(Boolean).length
  }, [form])

  function patch<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function runExtraction(fileName: string, fileSize: number, notes = form.notes, file?: File) {
    setExtracting(true)
    setError('')
    setNotice('Модель разбирает файл и пояснения…')
    try {
      if (apiOnline && file) {
        await upsertProject({
          ...form,
          fileName,
          fileSize,
          notes,
          updatedAt: new Date().toISOString(),
        })
        const result = await uploadProjectFile(form.id, file, notes)
        setForm((prev) => ({
          ...result.project,
          notes: prev.notes,
          name: prev.name.trim() ? prev.name : result.project.name,
        }))
        setExtracted(true)
        setNotice('Поля заполнены на сервере и сохранены после обработки файла. Проверьте и поправьте при необходимости.')
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось обработать файл')
    } finally {
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
            Положите финансовую модель или ТЭО. Пояснения сотрудника подмешиваются в разбор: отрасль, страна, регион и
            бюджет заполняются сами и остаются редактируемыми.
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
            <span>xlsx, pdf, docx · разбор запускается сразу после загрузки</span>
            {form.fileName && (
              <em className="drop__file">
                <IconFile /> {form.fileName} · {formatBytes(form.fileSize)}
              </em>
            )}
          </label>

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
