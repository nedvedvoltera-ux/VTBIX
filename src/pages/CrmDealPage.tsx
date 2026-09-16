import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  addCrmActivity,
  addCrmContact,
  addCrmPlan,
  deleteCrmContact,
  deleteCrmDeal,
  deleteCrmPlan,
  fetchCrmDeal,
  fetchCrmMail,
  patchCrmDeal,
  patchCrmPlan,
  sendCrmEmail,
} from '../api/client'
import { CrmStageBadge } from '../components/StatusBadge'
import { useApp } from '../context/AppContext'
import { getCrmDemoDeal, isCrmDemoId } from '../data/crmDemo'
import { CRM_STAGES, CRM_TOUCH_KINDS } from '../data/mock'
import type { CrmDeal, CrmMailSettings, CrmStage, CrmTouchKind } from '../types'
import { formatBudget, formatDate, fromDatetimeLocal, toDatetimeLocal } from '../utils/format'

const KIND_LABEL = Object.fromEntries(CRM_TOUCH_KINDS.map((item) => [item.id, item.label])) as Record<string, string>

export function CrmDealPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { apiOnline } = useApp()
  const [deal, setDeal] = useState<CrmDeal | null>(null)
  const [demo, setDemo] = useState(false)
  const [mail, setMail] = useState<CrmMailSettings | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [contact, setContact] = useState({ name: '', role: '', org: '', email: '', phone: '', isPrimary: false })
  const [activity, setActivity] = useState({ kind: 'meeting' as CrmTouchKind, happenedAt: toDatetimeLocal(new Date().toISOString()), title: '', body: '' })
  const [plan, setPlan] = useState({ kind: 'call' as CrmTouchKind, dueAt: '', title: '', body: '' })
  const [letter, setLetter] = useState({ to: '', cc: '', subject: '', body: '' })

  async function load() {
    if (isCrmDemoId(id)) {
      const demoDeal = getCrmDemoDeal(id)
      if (!demoDeal) {
        setError('Демо-карточка не найдена')
        return
      }
      setDeal(demoDeal)
      setDemo(true)
      const primary = demoDeal.contacts.find((item) => item.isPrimary && item.email) || demoDeal.contacts.find((item) => item.email)
      setLetter((prev) => ({
        ...prev,
        to: prev.to || primary?.email || '',
        subject: prev.subject || demoDeal.name,
      }))
      return
    }
    if (!id || !apiOnline) return
    try {
      const [next, nextMail] = await Promise.all([fetchCrmDeal(id), fetchCrmMail()])
      setDeal(next)
      setMail(nextMail)
      const primary = next.contacts.find((item) => item.isPrimary && item.email) || next.contacts.find((item) => item.email)
      setLetter((prev) => ({
        ...prev,
        to: prev.to || primary?.email || '',
        subject: prev.subject || next.name,
      }))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  useEffect(() => {
    void load()
  }, [id, apiOnline])

  const openPlans = useMemo(() => deal?.plans.filter((item) => item.status === 'open') || [], [deal])
  const donePlans = useMemo(() => deal?.plans.filter((item) => item.status !== 'open') || [], [deal])

  async function run(action: () => Promise<CrmDeal>) {
    if (demo) {
      setError('Демо-режим: изменения не сохраняются')
      return
    }
    setBusy(true)
    setError('')
    try {
      setDeal(await action())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function setStage(stage: CrmStage) {
    if (!deal) return
    await run(() => patchCrmDeal(deal.id, { stage }))
  }

  async function saveNotes() {
    if (!deal) return
    await run(() => patchCrmDeal(deal.id, { notes: deal.notes, grantor: deal.grantor, owner: deal.owner }))
  }

  async function onAddContact() {
    if (!deal) return
    await run(() => addCrmContact(deal.id, contact))
    setContact({ name: '', role: '', org: '', email: '', phone: '', isPrimary: false })
  }

  async function onAddActivity() {
    if (!deal) return
    await run(() =>
      addCrmActivity(deal.id, {
        kind: activity.kind,
        happenedAt: fromDatetimeLocal(activity.happenedAt) || new Date().toISOString(),
        title: activity.title,
        body: activity.body,
      }),
    )
    setActivity({ kind: 'meeting', happenedAt: toDatetimeLocal(new Date().toISOString()), title: '', body: '' })
  }

  async function onAddPlan() {
    if (!deal) return
    await run(() =>
      addCrmPlan(deal.id, {
        kind: plan.kind,
        dueAt: fromDatetimeLocal(plan.dueAt),
        title: plan.title,
        body: plan.body,
      }),
    )
    setPlan({ kind: 'call', dueAt: '', title: '', body: '' })
  }

  async function completePlan(planId: string) {
    if (!deal) return
    await run(() => patchCrmPlan(deal.id, planId, { status: 'done' }))
  }

  async function sendLetter() {
    if (!deal) return
    if (demo) {
      setError('Демо-режим: письма не отправляются')
      return
    }
    setBusy(true)
    setError('')
    try {
      const result = await sendCrmEmail(deal.id, letter)
      setDeal(result.deal)
      setLetter((prev) => ({ ...prev, body: '' }))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function onDelete() {
    if (!deal || demo) return
    if (!window.confirm(`Удалить карточку CRM «${deal.name}»? История касаний тоже пропадёт.`)) return
    await deleteCrmDeal(deal.id)
    navigate('/crm')
  }

  if (error && !deal) {
    return (
      <section className="page">
        <div className="empty">
          <h3>Карточка не найдена</h3>
          <p>{error}</p>
          <Link to="/crm" className="btn">К CRM</Link>
        </div>
      </section>
    )
  }

  if (!deal) {
    return (
      <section className="page">
        <div className="empty">
          <h3>Загружаю карточку CRM</h3>
        </div>
      </section>
    )
  }

  return (
    <section className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">
            <Link to="/crm">CRM</Link>
            <span> / карточка</span>
          </p>
          <h1>{deal.name}</h1>
          <div className="meta-line">
            <CrmStageBadge value={deal.stage} />
            {demo && <span className="badge badge--info">Демо</span>}
            <span>{deal.sourceType === 'infovod' ? 'Повод: инфоповод' : 'Повод: объект анализа'}</span>
            <span>ответственный: {deal.owner}</span>
          </div>
        </div>
        <div className="actions">
          {!demo && deal.projectId && (
            <Link className="btn" to={`/projects/${deal.projectId}`}>Объект анализа</Link>
          )}
          {!demo && deal.infovodId && (
            <Link className="btn" to={`/media/${deal.infovodId}`}>Инфоповод</Link>
          )}
          <Link className="btn" to="/crm">К воронке</Link>
          <button type="button" className="btn btn--danger" disabled={busy || demo} onClick={() => void onDelete()}>
            Удалить
          </button>
        </div>
      </div>

      {demo && (
        <div className="banner">
          Учебная карточка: контакты, касания и план показаны как в живой системе, но ничего не сохраняется.
        </div>
      )}

      {error && <div className="banner banner--danger">{error}</div>}

      <div className="facts">
        <article>
          <span>Отрасль</span>
          <strong>{deal.industry || '—'}</strong>
        </article>
        <article>
          <span>Локация</span>
          <strong>{[deal.country, deal.region].filter(Boolean).join(', ') || '—'}</strong>
        </article>
        <article>
          <span>Контрагент</span>
          <strong>{deal.grantor || '—'}</strong>
        </article>
        <article>
          <span>Бюджет</span>
          <strong>{deal.budget != null ? formatBudget(deal.budget) : '—'}</strong>
        </article>
      </div>

      <div className="card settings-block">
        <h2>Стадия</h2>
        <div className="chips">
          {CRM_STAGES.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`chip ${deal.stage === item.id ? 'is-on' : ''}`}
              disabled={busy || demo}
              onClick={() => void setStage(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="split split--note">
        <div className="card settings-block">
          <h2>Контакты</h2>
          {!deal.contacts.length && <p className="hint">Добавьте концедента, консультанта или инвестора.</p>}
          <div className="stack">
            {deal.contacts.map((item) => (
              <article key={item.id} className="crm-row">
                <div>
                  <strong>{item.name}</strong>
                  <p className="hint">
                    {[item.role, item.org, item.email, item.phone].filter(Boolean).join(' · ')}
                    {item.isPrimary ? ' · основной' : ''}
                  </p>
                </div>
                <button type="button" className="btn btn--ghost" disabled={busy || demo} onClick={() => void run(() => deleteCrmContact(deal.id, item.id))}>
                  Убрать
                </button>
              </article>
            ))}
          </div>
          <div className="filter-row">
            <label className="field">Имя<input value={contact.name} onChange={(e) => setContact((prev) => ({ ...prev, name: e.target.value }))} /></label>
            <label className="field">Роль<input value={contact.role} onChange={(e) => setContact((prev) => ({ ...prev, role: e.target.value }))} placeholder="концедент, юрист" /></label>
            <label className="field">Организация<input value={contact.org} onChange={(e) => setContact((prev) => ({ ...prev, org: e.target.value }))} /></label>
            <label className="field">Email<input value={contact.email} onChange={(e) => setContact((prev) => ({ ...prev, email: e.target.value }))} /></label>
          </div>
          <label className="field">Телефон<input value={contact.phone} onChange={(e) => setContact((prev) => ({ ...prev, phone: e.target.value }))} /></label>
          <label className="check">
            <input type="checkbox" checked={contact.isPrimary} onChange={(e) => setContact((prev) => ({ ...prev, isPrimary: e.target.checked }))} />
            Основной контакт для писем
          </label>
          <button type="button" className="btn" disabled={busy || demo || !contact.name.trim()} onClick={() => void onAddContact()}>
            Добавить контакт
          </button>
        </div>

        <div className="card settings-block">
          <h2>Письмо с карточки</h2>
          {mail?.connected ? (
            <>
              <label className="field">Кому<input value={letter.to} onChange={(e) => setLetter((prev) => ({ ...prev, to: e.target.value }))} /></label>
              <label className="field">Копия<input value={letter.cc} onChange={(e) => setLetter((prev) => ({ ...prev, cc: e.target.value }))} /></label>
              <label className="field">Тема<input value={letter.subject} onChange={(e) => setLetter((prev) => ({ ...prev, subject: e.target.value }))} /></label>
              <label className="field">
                Текст
                <textarea rows={6} value={letter.body} onChange={(e) => setLetter((prev) => ({ ...prev, body: e.target.value }))} />
              </label>
              <button type="button" className="btn btn--primary" disabled={busy || demo || !letter.to || !letter.body.trim()} onClick={() => void sendLetter()}>
                Отправить и записать в ленту
              </button>
            </>
          ) : (
            <p className="hint">
              Почта ещё не подключена. Откройте CRM → «Почта SMTP» и укажите сервер исходящей почты.
            </p>
          )}
        </div>
      </div>

      <div className="split split--note">
        <div className="card settings-block">
          <h2>Проведённое касание</h2>
          <p className="hint">Встреча, звонок или письмо, которое уже состоялось.</p>
          <div className="filter-row">
            <label className="field">
              Тип
              <select value={activity.kind} onChange={(e) => setActivity((prev) => ({ ...prev, kind: e.target.value as CrmTouchKind }))}>
                {CRM_TOUCH_KINDS.filter((item) => item.id !== 'other').map((item) => (
                  <option key={item.id} value={item.id}>{item.label}</option>
                ))}
              </select>
            </label>
            <label className="field">
              Когда
              <input type="datetime-local" value={activity.happenedAt} onChange={(e) => setActivity((prev) => ({ ...prev, happenedAt: e.target.value }))} />
            </label>
          </div>
          <label className="field">Заголовок<input value={activity.title} onChange={(e) => setActivity((prev) => ({ ...prev, title: e.target.value }))} placeholder="Созвон с концедентом" /></label>
          <label className="field">
            Комментарий
            <textarea rows={5} value={activity.body} onChange={(e) => setActivity((prev) => ({ ...prev, body: e.target.value }))} placeholder="О чём договорились, кто был, какой тон" />
          </label>
          <button type="button" className="btn" disabled={busy || demo || (!activity.title.trim() && !activity.body.trim())} onClick={() => void onAddActivity()}>
            Записать касание
          </button>
        </div>

        <div className="card settings-block">
          <h2>План следующего касания</h2>
          <p className="hint">Что сделать дальше и к какому сроку. Просроченные планы подсвечиваются в воронке.</p>
          <div className="filter-row">
            <label className="field">
              Тип
              <select value={plan.kind} onChange={(e) => setPlan((prev) => ({ ...prev, kind: e.target.value as CrmTouchKind }))}>
                {CRM_TOUCH_KINDS.map((item) => (
                  <option key={item.id} value={item.id}>{item.label}</option>
                ))}
              </select>
            </label>
            <label className="field">
              Срок
              <input type="datetime-local" value={plan.dueAt} onChange={(e) => setPlan((prev) => ({ ...prev, dueAt: e.target.value }))} />
            </label>
          </div>
          <label className="field">Что сделать<input value={plan.title} onChange={(e) => setPlan((prev) => ({ ...prev, title: e.target.value }))} placeholder="Запросить ТЭО, выйти на концедента" /></label>
          <label className="field">
            Детали
            <textarea rows={4} value={plan.body} onChange={(e) => setPlan((prev) => ({ ...prev, body: e.target.value }))} />
          </label>
          <button type="button" className="btn" disabled={busy || demo || !plan.title.trim()} onClick={() => void onAddPlan()}>
            Поставить в план
          </button>
        </div>
      </div>

      <div className="card settings-block">
        <h2>Заметка по карточке</h2>
        <div className="filter-row">
          <label className="field">Контрагент / концедент<input value={deal.grantor || ''} onChange={(e) => setDeal((prev) => prev ? { ...prev, grantor: e.target.value } : prev)} /></label>
          <label className="field">Ответственный<input value={deal.owner} onChange={(e) => setDeal((prev) => prev ? { ...prev, owner: e.target.value } : prev)} /></label>
        </div>
        <label className="field">
          Свободный комментарий
          <textarea rows={4} value={deal.notes || ''} onChange={(e) => setDeal((prev) => prev ? { ...prev, notes: e.target.value } : prev)} />
        </label>
        <button type="button" className="btn" disabled={busy || demo} onClick={() => void saveNotes()}>Сохранить заметку</button>
      </div>

      <div className="card settings-block">
        <h2>Лента</h2>
        <div className="timeline">
          {openPlans.map((item) => {
            const overdue = Boolean(item.dueAt && Date.parse(item.dueAt) < Date.now())
            return (
              <article key={item.id} className={`timeline__item ${overdue ? 'is-overdue' : 'is-plan'}`}>
                <div className="crm-row">
                  <div>
                    <span className="badge badge--warn">План · {KIND_LABEL[item.kind] || item.kind}</span>
                    {item.dueAt && <span className="hint">{formatDate(item.dueAt)}</span>}
                    <strong>{item.title}</strong>
                    {item.body && <p>{item.body}</p>}
                  </div>
                  <div className="actions">
                    <button type="button" className="btn" disabled={busy || demo} onClick={() => void completePlan(item.id)}>Сделано</button>
                    <button type="button" className="btn btn--ghost" disabled={busy || demo} onClick={() => void run(() => deleteCrmPlan(deal.id, item.id))}>Снять</button>
                  </div>
                </div>
              </article>
            )
          })}
          {deal.activities.map((item) => (
            <article key={item.id} className="timeline__item is-done">
              <span className="badge badge--ok">{KIND_LABEL[item.kind] || item.kind}</span>
              <span className="hint">{formatDate(item.happenedAt)} · {item.author}</span>
              {item.title && <strong>{item.title}</strong>}
              {item.body && <p>{item.body}</p>}
            </article>
          ))}
          {donePlans.map((item) => (
            <article key={item.id} className="timeline__item">
              <span className="badge badge--muted">{item.status === 'cancelled' ? 'Снято' : 'Закрыто'} · {KIND_LABEL[item.kind]}</span>
              <strong>{item.title}</strong>
            </article>
          ))}
          {!openPlans.length && !deal.activities.length && <p className="hint">Пока нет касаний — запишите встречу или поставьте план.</p>}
        </div>
      </div>
    </section>
  )
}
