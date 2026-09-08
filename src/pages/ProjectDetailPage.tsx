import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { FitBadge, RecommendationBadge, StatusBadge } from '../components/StatusBadge'
import { EMPTY_NOTE, NoteFields, ProjectCardFields } from '../components/ProjectCardFields'
import { formatBudget, formatBytes, formatDate } from '../utils/format'
import { IconFile, IconIndustry, IconPin, IconWallet } from '../components/Icons'
import type { AnalyticalNote, Project } from '../types'

function NoteView({ note, project }: { note: AnalyticalNote; project: Project }) {
  return (
    <article className="note">
      <header className="note__hero">
        <p className="eyebrow">Аналитическая записка</p>
        <h2>{project.name}</h2>
        <p>{note.executiveSummary}</p>
      </header>

      <section>
        <h3>Описание проекта</h3>
        <p>{note.description}</p>
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
                <th>Комментарий</th>
              </tr>
            </thead>
            <tbody>
              {note.financials.map((row, index) => (
                <tr key={`${row.metric}-${index}`}>
                  <td>{row.metric}</td>
                  <td>{row.value}</td>
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
  const { projects, upsertProject, updateProject } = useApp()
  const project = projects.find((item) => item.id === id)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<Project | null>(project ?? null)

  useEffect(() => {
    if (project && !editing) setForm(project)
  }, [project, editing])

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
              {project.status === 'error' && (
                <button
                  type="button"
                  className="btn"
                  onClick={() => updateProject(project.id, { status: 'processing', progress: 12 })}
                >
                  Повторить расчёт
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {editing ? (
        <div className="stack">
          <div className="panel">
            <h2>Поля карточки</h2>
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
                <FitBadge value={project.concessionFit} />
                {project.concessionScore != null ? ` · балл ${project.concessionScore}` : ''}
              </strong>
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
              <span>Файл</span>
              <strong>
                {project.fileName ?? 'нет'} {project.fileSize ? `· ${formatBytes(project.fileSize)}` : ''}
              </strong>
            </article>
          </div>

          {project.status === 'processing' && (
            <div className="banner">
              <div>
                <strong>Идёт автоматизированный расчёт</strong>
                <p>Модель готовит записку по текущим настройкам мастера промпта.</p>
              </div>
              <div className="progress progress--wide">
                <span style={{ width: `${project.progress}%` }} />
              </div>
              <em>{project.progress}%</em>
            </div>
          )}

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
                <strong>Расчёт остановился</strong>
                <p>В мок-сценарии не удалось прочитать часть листов финансовой модели. Повторите или поправьте файл.</p>
              </div>
            </div>
          )}

          <div className="split split--note">
            <div className="stack">
              {project.note && (project.note.executiveSummary || project.note.description || project.status === 'ready') ? (
                <NoteView note={project.note} project={project} />
              ) : (
                <div className="empty empty--soft">
                  <h3>Записка ещё не готова</h3>
                  <p>
                    {project.fileName
                      ? 'После завершения расчёта здесь появится аналитическая записка. Её можно заполнить вручную кнопкой «Править карточку».'
                      : 'Загрузите файл проекта, чтобы запустить разбор.'}
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
