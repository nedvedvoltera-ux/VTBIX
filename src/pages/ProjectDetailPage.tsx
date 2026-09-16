import { Fragment, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { FitBadge, RecommendationBadge, StatusBadge } from '../components/StatusBadge'
import { EMPTY_NOTE, NoteFields, ProjectCardFields } from '../components/ProjectCardFields'
import { DocumentList } from '../components/DocumentList'
import { formatBudget, formatDate } from '../utils/format'
import { IconFile, IconIndustry, IconPin, IconSpark, IconWallet } from '../components/Icons'
import type { AnalyticalNote, Project } from '../types'
import { computeRanking } from '../utils/concession'
import { analyzeProject, createCrmDeal, deleteProjectDocument, lookupCrmDeal, uploadProjectFiles } from '../api/client'
import { projectDocuments } from '../utils/documents'
import { displayConcessionTerms } from '../data/ksTerms'
import { markdownSummary, pipelineErrorTitle } from '../utils/pipelineStatus'

function NoteView({ note, project }: { note: AnalyticalNote; project: Project }) {
  const terms = displayConcessionTerms(note.terms)
  const exceptions = note.riskBalance?.exceptions || 'критичных перекосов не выявлено'
  const riskStatement =
    note.riskBalance?.statement ||
    `Проект КС представляется относительно сбалансированным по распределению рисков, за исключением условий о ${exceptions}.`
  let lastGroup = ''

  return (
    <article className="note">
      <header className="note__hero">
        <p className="eyebrow">Карточка проекта КС</p>
        <h2>{project.name}</h2>
        <p>{note.executiveSummary || 'Резюме появится после разбора Markdown моделью.'}</p>
      </header>

      <section>
        <h3>Описание проекта</h3>
        <p>{note.description || '—'}</p>
      </section>

      <section className="ks-assess">
        <h3>Оценка по документу</h3>
        <div className="ks-assess__grid">
          <article>
            <h4>Императивные нормы закона</h4>
            <p>{note.assessment?.imperativeLaw || '—'}</p>
          </article>
          <article>
            <h4>Реалистичность исполнения (ПД, ЗУ)</h4>
            <p>{note.assessment?.executionRealism || '—'}</p>
          </article>
          <article>
            <h4>Финансовая целесообразность для инвестора</h4>
            <p>{note.assessment?.investorFinance || '—'}</p>
          </article>
        </div>
      </section>

      <section>
        <h3>Баланс распределения рисков</h3>
        <p>{riskStatement}</p>
      </section>

      <section>
        <h3>Основные условия проекта КС</h3>
        <div className="table-wrap">
          <table className="ks-table">
            <thead>
              <tr>
                <th>Условие</th>
                <th>Содержание из соглашения</th>
              </tr>
            </thead>
            <tbody>
              {terms.map((row) => {
                const showGroup = Boolean(row.group && row.group !== lastGroup)
                if (row.group) lastGroup = row.group
                else lastGroup = ''
                return (
                  <Fragment key={row.id}>
                    {showGroup && (
                      <tr className="ks-table__group">
                        <th colSpan={2}>{row.group}</th>
                      </tr>
                    )}
                    <tr>
                      <td>{row.label}</td>
                      <td>{row.value || 'недостаточно данных'}</td>
                    </tr>
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
      <section>
        <h3>Отраслевой контекст</h3>
        <p>{note.industryContext}</p>
      </section>
      <section>
        <h3>Локация</h3>
        <p>{note.location}</p>
      </section>
      <section>
        <h3>Бюджет</h3>
        <p>{note.budgetBreakdown}</p>
      </section>
      <section>
        <h3>Финансовые метрики</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Метрика</th>
                <th>Значение</th>
                <th>Балл</th>
                <th>Комментарий</th>
              </tr>
            </thead>
            <tbody>
              {note.financials.map((row, index) => (
                <tr key={`${row.metric}-${index}`}>
                  <td>{row.metric}</td>
                  <td>{row.value}</td>
                  <td>{row.score != null ? row.score : '—'}</td>
                  <td>{row.comment}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section>
        <h3>Сценарии</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Сценарий</th>
                <th>NPV</th>
                <th>IRR</th>
              </tr>
            </thead>
            <tbody>
              {note.scenarios.map((row, index) => (
                <tr key={`${row.name}-${index}`}>
                  <td>{row.name}</td>
                  <td>{row.npv}</td>
                  <td>{row.irr}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section>
        <h3>Риски</h3>
        <ul className="risks">
          {note.risks.map((risk, index) => (
            <li key={`${risk.title}-${index}`}>
              <span className={`risk-dot risk-dot--${risk.level}`} />
              <div>
                <strong>{risk.title}</strong>
                <p>{risk.text}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section className="note__verdict">
        <h3>Рекомендация</h3>
        <p>{note.recommendation}</p>
      </section>
    </article>
  )
}

export function ProjectDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { projects, upsertProject, updateProject, removeProject, prompt } = useApp()
  const project = projects.find((item) => item.id === id)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<Project | null>(project ?? null)
  const addRef = useRef<HTMLInputElement>(null)
  const [crmId, setCrmId] = useState<string | null>(null)
  const [crmBusy, setCrmBusy] = useState(false)

  useEffect(() => {
    if (project && !editing) setForm(project)
  }, [project, editing])

  useEffect(() => {
    if (!project?.id) return
    void lookupCrmDeal({ projectId: project.id })
      .then((result) => setCrmId(result.deal?.id || null))
      .catch(() => setCrmId(null))
  }, [project?.id])

  if (!project || !form) {
    return (
      <section className="page">
        <div className="empty">
          <h3>Проект не найден</h3>
          <Link to="/" className="btn">
            К списку
          </Link>
        </div>
      </section>
    )
  }

  const currentProject = project
  const currentForm = form
  const ranking = computeRanking(currentProject, prompt.metrics)

  function patch<K extends keyof Project>(key: K, value: Project[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  function startEdit() {
    setForm({ ...currentProject, note: currentProject.note ?? { ...EMPTY_NOTE } })
    setEditing(true)
  }

  function cancelEdit() {
    setForm(currentProject)
    setEditing(false)
  }

  async function saveEdit() {
    await upsertProject({
      ...currentForm,
      name: currentForm.name.trim() || 'Без названия',
      updatedAt: new Date().toISOString(),
    })
    setEditing(false)
  }

  async function addFiles(files: File[]) {
    const accepted = files.filter((file) => /\.(xlsx|xls|xlsm|pdf|docx|doc|csv|md|txt)$/i.test(file.name))
    if (!accepted.length) return
    await uploadProjectFiles(currentProject.id, accepted, currentProject.notes)
  }

  async function rebuildFields() {
    await analyzeProject(currentProject.id, currentProject.notes).catch(() => {
      void updateProject(currentProject.id, { status: 'processing', progress: 12, pipelineStage: 'extracting' })
    })
  }

  async function onDelete() {
    const label = currentProject.name || 'этот объект'
    if (!window.confirm(`Удалить «${label}» из базы? Файлы и Markdown тоже будут удалены.`)) return
    await removeProject(currentProject.id)
    navigate('/')
  }

  async function toCrm() {
    setCrmBusy(true)
    try {
      const result = await createCrmDeal({ sourceType: 'project', projectId: currentProject.id })
      setCrmId(result.deal.id)
      navigate(`/crm/${result.deal.id}`)
    } finally {
      setCrmBusy(false)
    }
  }

  return (
    <section className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">
            <Link to="/">Объекты анализа</Link>
            <span> / {project.id}</span>
          </p>
          <h1>{editing ? 'Редактирование карточки' : project.name || 'Без названия'}</h1>
          {!editing && (
            <div className="meta-line">
              <FitBadge value={project.concessionFit} />
              <StatusBadge status={project.status} />
              <RecommendationBadge value={project.recommendation} />
              <span>обновили {formatDate(project.updatedAt)}</span>
              <span>ответственный: {project.owner}</span>
            </div>
          )}
        </div>
        <div className="actions">
          {editing ? (
            <>
              <button type="button" className="btn" onClick={cancelEdit}>
                Отмена
              </button>
              <button type="button" className="btn btn--primary" onClick={saveEdit}>
                Сохранить карточку
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn btn--primary" onClick={startEdit}>
                Править карточку
              </button>
              {crmId ? (
                <Link className="btn" to={`/crm/${crmId}`}>
                  Открыть CRM
                </Link>
              ) : (
                <button type="button" className="btn" disabled={crmBusy} onClick={() => void toCrm()}>
                  {crmBusy ? 'В CRM…' : 'В CRM'}
                </button>
              )}
              <button
                type="button"
                className="btn"
                disabled={project.status === 'processing' || !projectDocuments(project).length}
                onClick={() => void rebuildFields()}
              >
                <IconSpark />
                Пересобрать поля из файлов
              </button>
              {project.status === 'error' && (
                <button type="button" className="btn" onClick={() => void rebuildFields()}>
                  Повторить расчёт
                </button>
              )}
              <button type="button" className="btn btn--danger" onClick={() => void onDelete()}>
                Удалить из базы
              </button>
            </>
          )}
        </div>
      </div>

      {editing ? (
        <div className="stack">
          <div className="panel">
            <div className="panel__head">
              <h2>Поля карточки</h2>
              <StatusBadge status={form.status} />
            </div>
            <ProjectCardFields form={form} patch={patch} />
          </div>
          <div className="panel">
            <h2>Аналитическая записка</h2>
            <NoteFields
              note={form.note ?? EMPTY_NOTE}
              onChange={(note) => setForm((prev) => (prev ? { ...prev, note } : prev))}
            />
          </div>
          <div className="actions">
            <button type="button" className="btn" onClick={cancelEdit}>
              Отмена
            </button>
            <button type="button" className="btn btn--primary" onClick={saveEdit}>
              Сохранить карточку
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="facts">
            <article>
              <span>Приоритет концессии</span>
              <strong>
                <FitBadge value={ranking.fit ?? project.concessionFit} />
                {ranking.score != null ? ` · балл ${ranking.score}` : ''}
              </strong>
              {ranking.byMetrics ? (
                <em className="hint">по весам метрик</em>
              ) : project.concessionScore != null ? (
                <em className="hint">балл карточки</em>
              ) : null}
            </article>
            <article>
              <IconIndustry />
              <span>Отрасль</span>
              <strong>{project.industry || '—'}</strong>
            </article>
            <article>
              <IconPin />
              <span>Местоположение</span>
              <strong>{[project.country, project.region].filter(Boolean).join(', ') || '—'}</strong>
            </article>
            <article>
              <IconWallet />
              <span>Бюджет</span>
              <strong>{formatBudget(project.budget)}</strong>
            </article>
            <article>
              <IconFile />
              <span>Файлы</span>
              <strong>
                {projectDocuments(project).length
                  ? `${projectDocuments(project).length} · ${project.fileName}`
                  : 'нет'}
              </strong>
            </article>
          </div>

          {ranking.byMetrics && ranking.parts.length > 0 && (
            <div className="ranking-breakdown">
              {ranking.parts.map((part) => (
                <span key={part.name}>
                  {part.name}
                  <strong>{part.score}</strong>
                  <em>вес {part.weight}</em>
                </span>
              ))}
            </div>
          )}

          {project.status === 'processing' && (
            <div className="banner">
              <div>
                <strong>
                  {project.pipelineStage === 'extracting'
                    ? 'Qwen извлекает параметры'
                    : 'Docling переводит документ в Markdown'}
                </strong>
                <p>
                  {project.pipelineMessage ||
                    'Модель готовит записку по текущим настройкам мастера промпта. Поля карточки заполняются по мере ответа.'}
                </p>
              </div>
              <div className="progress progress--wide">
                <span style={{ width: `${project.progress}%` }} />
              </div>
              <em>{project.progress}%</em>
            </div>
          )}

          <div className="panel">
            <div className="panel__head">
              <h2>Документы и Markdown</h2>
              <button type="button" className="btn btn--ghost" onClick={() => addRef.current?.click()}>
                Добавить файлы
              </button>
            </div>
            <input
              ref={addRef}
              type="file"
              hidden
              multiple
              accept=".xlsx,.xls,.xlsm,.pdf,.docx,.doc,.csv,.md,.txt"
              onChange={(e) => {
                void addFiles([...(e.target.files || [])])
                e.target.value = ''
              }}
            />
            {projectDocuments(project).length ? (
              <DocumentList
                project={project}
                onRemove={(docId) => {
                  void deleteProjectDocument(project.id, docId)
                }}
              />
            ) : (
              <p className="hint">Добавьте модель, ТЭО или уже готовый Markdown.</p>
            )}
            {project.markdownPreview && (
              <details className="markdown-preview" open={project.status === 'error'}>
                <summary>
                  {markdownSummary(project)}
                  {' · '}
                  <a href={`/api/projects/${project.id}/markdown`} download={`${project.id}.md`}>
                    скачать все .md
                  </a>
                </summary>
                <pre>{project.markdownPreview}</pre>
              </details>
            )}
          </div>

          {project.status === 'queued' && (
            <div className="banner">
              <div>
                <strong>Объект в очереди</strong>
                <p>Расчёт начнётся после текущих задач периметра.</p>
              </div>
            </div>
          )}

          {project.status === 'error' && (
            <div className="banner banner--danger">
              <div>
                <strong>{pipelineErrorTitle(project)}</strong>
                <p>{project.pipelineMessage || 'Не удалось завершить разбор. Смотрите этап в тексте ошибки.'}</p>
                <p className="hint">{markdownSummary(project)}</p>
              </div>
            </div>
          )}

          <div className="split split--note">
            <div className="stack">
              {project.note &&
              (project.extractedByLlm ||
                project.note.executiveSummary ||
                project.note.description ||
                (project.note.terms && project.note.terms.some((row) => row.value)) ||
                project.status === 'ready') ? (
                <NoteView note={project.note} project={project} />
              ) : (
                <div className="empty empty--soft">
                  <h3>Записка ещё не готова</h3>
                  <p>
                    {projectDocuments(project).length
                      ? 'После «Пересобрать поля» здесь появится записка. Её можно заполнить вручную.'
                      : 'Загрузите файлы проекта, затем отправьте Markdown в Qwen кнопкой «Пересобрать поля».'}
                  </p>
                </div>
              )}
            </div>
            <aside className="panel">
              <h2>Пояснения сотрудника</h2>
              <p className="notes-body">{project.notes || 'Пояснения не добавлены.'}</p>
              <p className="hint">
                {project.extractedByLlm
                  ? 'Все поля карточки, включая приоритет и записку, можно править вручную.'
                  : 'Автозаполнение ещё не запускалось.'}
              </p>
              <button type="button" className="btn btn--ghost" onClick={startEdit}>
                Править все поля
              </button>
            </aside>
          </div>
        </>
      )}
    </section>
  )
}
