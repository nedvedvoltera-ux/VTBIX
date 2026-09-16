import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { convertMediaHit, createCrmDeal, fetchMediaHit, lookupCrmDeal, patchMediaHit } from '../api/client'
import { InfovodDecisionBadge, InfovodFitBadge, NewsStageBadge } from '../components/StatusBadge'
import { useApp } from '../context/AppContext'
import type { InfovodDecision, MediaPublication } from '../types'
import { formatBudget, formatDate } from '../utils/format'

const DECISIONS: { id: InfovodDecision; label: string }[] = [
  { id: 'new', label: 'Новый' },
  { id: 'watch', label: 'На контроле' },
  { id: 'pursue', label: 'В работу' },
  { id: 'dismissed', label: 'Отклонить' },
]

export function InfovodDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { apiOnline, upsertProject } = useApp()
  const [item, setItem] = useState<MediaPublication | null>(null)
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [crmId, setCrmId] = useState<string | null>(null)

  useEffect(() => {
    if (!id || !apiOnline) return
    void fetchMediaHit(id)
      .then((next) => {
        setItem(next)
        setNotes(next.notes || '')
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
  }, [id, apiOnline])

  useEffect(() => {
    if (!id || !apiOnline) return
    void lookupCrmDeal({ infovodId: id })
      .then((result) => setCrmId(result.deal?.id || null))
      .catch(() => setCrmId(null))
  }, [id, apiOnline])

  async function setDecision(decision: InfovodDecision) {
    if (!item) return
    setBusy(true)
    setError('')
    try {
      const next = await patchMediaHit(item.id, { decision, notes })
      setItem(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function saveNotes() {
    if (!item) return
    setBusy(true)
    try {
      const next = await patchMediaHit(item.id, { notes })
      setItem(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function toProject() {
    if (!item) return
    setBusy(true)
    setError('')
    try {
      await patchMediaHit(item.id, { notes })
      const result = await convertMediaHit(item.id)
      if (result.project) await upsertProject(result.project)
      setItem(result.hit)
      navigate(`/projects/${result.projectId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function toCrm() {
    if (!item) return
    setBusy(true)
    setError('')
    try {
      const result = await createCrmDeal({ sourceType: 'infovod', infovodId: item.id })
      setCrmId(result.deal.id)
      navigate(`/crm/${result.deal.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  if (error && !item) {
    return (
      <section className="page">
        <div className="empty">
          <h3>Инфоповод не найден</h3>
          <p>{error}</p>
          <Link to="/media" className="btn">
            К ленте
          </Link>
        </div>
      </section>
    )
  }

  if (!item) {
    return (
      <section className="page">
        <div className="empty">
          <h3>Загружаю инфоповод</h3>
        </div>
      </section>
    )
  }

  return (
    <section className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">
            <Link to="/media">Инфоповоды</Link>
            <span> / инфоповод</span>
          </p>
          <h1>{item.name || item.projectName || item.title}</h1>
          <div className="meta-line">
            <InfovodDecisionBadge value={item.decision} />
            <InfovodFitBadge value={item.fit} />
            <NewsStageBadge value={item.newsStage} />
            {item.score != null && <span>балл {item.score}</span>}
          </div>
        </div>
        <div className="actions">
          <a className="btn" href={item.url} target="_blank" rel="noreferrer">
            Источник
          </a>
          {item.projectId ? (
            <Link className="btn btn--primary" to={`/projects/${item.projectId}`}>
              Открыть объект
            </Link>
          ) : (
            <button type="button" className="btn btn--primary" disabled={busy} onClick={() => void toProject()}>
              Завести объект анализа
            </button>
          )}
          {crmId ? (
            <Link className="btn" to={`/crm/${crmId}`}>
              Открыть CRM
            </Link>
          ) : (
            <button type="button" className="btn" disabled={busy} onClick={() => void toCrm()}>
              В CRM
            </button>
          )}
        </div>
      </div>

      {error && <div className="banner banner--danger">{error}</div>}

      <div className="facts">
        <article>
          <span>Отрасль</span>
          <strong>{item.industry || '—'}</strong>
        </article>
        <article>
          <span>Локация</span>
          <strong>{[item.country, item.region].filter(Boolean).join(', ') || '—'}</strong>
        </article>
        <article>
          <span>Концедент</span>
          <strong>{item.grantor || '—'}</strong>
        </article>
        <article>
          <span>Тип объекта</span>
          <strong>{item.objectType || '—'}</strong>
        </article>
        <article>
          <span>Бюджет</span>
          <strong>{item.budgetEstimate != null ? formatBudget(item.budgetEstimate) : item.budgetHint || '—'}</strong>
        </article>
      </div>

      <div className="card settings-block">
        <h2>Решение</h2>
        <p className="hint">Инфоповод — триггер: взять в проработку, держать на контроле или закрыть как нецелесообразный.</p>
        <div className="chips">
          {DECISIONS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={`chip ${item.decision === entry.id ? 'is-on' : ''}`}
              disabled={busy || item.decision === 'project'}
              onClick={() => void setDecision(entry.id)}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </div>

      <div className="split split--note">
        <div className="card settings-block">
          <h2>Суть</h2>
          {item.objectType && <p><strong>Тип объекта:</strong> {item.objectType}</p>}
          {item.summary && <p>{item.summary}</p>}
          {item.concessionAngle && (
            <div className="callout">
              <strong>Концессионный угол</strong>
              <p>{item.concessionAngle}</p>
            </div>
          )}
          {item.nextStep && <p className="hint">Следующий шаг: {item.nextStep}</p>}
          <p className="hint">
            {item.source || 'СМИ'} · {formatDate(item.publishedAt || item.foundAt || '')} · {item.title}
          </p>
        </div>
        <div className="card settings-block">
          <h2>Заметка финблока</h2>
          <label className="field">
            Комментарий к решению
            <textarea rows={8} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          <button type="button" className="btn" disabled={busy} onClick={() => void saveNotes()}>
            Сохранить заметку
          </button>
        </div>
      </div>
    </section>
  )
}
