import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  createCrmDeal,
  fetchCrmDeals,
  fetchCrmMail,
  fetchCrmSources,
  putCrmMail,
  testCrmMail,
} from '../api/client'
import { CrmCard, type CrmView } from '../components/CrmCard'
import { CrmFunnel } from '../components/CrmFunnel'
import { IconGrid, IconKanban, IconPlus, IconRows, IconSearch } from '../components/Icons'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { CRM_DEMO_DEALS, readCrmDemo, writeCrmDemo } from '../data/crmDemo'
import {
  BUDGET_FILTERS,
  COUNTRIES,
  CRM_SOURCE_FILTERS,
  CRM_STAGES,
  INDUSTRIES,
  REGIONS_BY_COUNTRY,
} from '../data/mock'
import type { CrmDeal, CrmMailSettings, CrmSourceOption, CrmSourceType, CrmStage } from '../types'

const VIEW_KEY = 'vtbih.crmView'

const emptyMail = (): CrmMailSettings => ({
  host: '',
  port: 587,
  secure: false,
  user: '',
  from: '',
  fromName: 'VTBIH CRM',
  hasPassword: false,
  connected: false,
})

function readView(): CrmView {
  try {
    const stored = localStorage.getItem(VIEW_KEY)
    return stored === 'row' || stored === 'tile' || stored === 'board' ? stored : 'board'
  } catch {
    return 'board'
  }
}

export function CrmPage() {
  const { apiOnline } = useApp()
  const { enabled, isAdmin } = useAuth()
  const canEditMail = !enabled || isAdmin
  const navigate = useNavigate()
  const [liveDeals, setLiveDeals] = useState<CrmDeal[]>([])
  const [sources, setSources] = useState<{ projects: CrmSourceOption[]; infovods: CrmSourceOption[] }>({
    projects: [],
    infovods: [],
  })
  const [mail, setMail] = useState<CrmMailSettings>(emptyMail)
  const [password, setPassword] = useState('')
  const [tab, setTab] = useState<'feed' | 'mail'>('feed')
  const [view, setView] = useState<CrmView>(readView)
  const [demo, setDemo] = useState(readCrmDemo)
  const [query, setQuery] = useState('')
  const [stage, setStage] = useState<'all' | CrmStage>('all')
  const [source, setSource] = useState<'all' | CrmSourceType>('all')
  const [industry, setIndustry] = useState('all')
  const [country, setCountry] = useState('all')
  const [region, setRegion] = useState('all')
  const [budget, setBudget] = useState('all')
  const [overdueOnly, setOverdueOnly] = useState(false)
  const [creating, setCreating] = useState(false)
  const [sourceType, setSourceType] = useState<CrmSourceType>('project')
  const [sourceId, setSourceId] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [mailNote, setMailNote] = useState('')

  async function load() {
    if (!apiOnline) {
      setLoading(false)
      return
    }
    setError('')
    try {
      const [nextDeals, nextSources, nextMail] = await Promise.all([
        fetchCrmDeals(),
        fetchCrmSources(),
        fetchCrmMail(),
      ])
      setLiveDeals(nextDeals)
      setSources(nextSources)
      setMail(nextMail)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [apiOnline])

  function changeView(next: CrmView) {
    setView(next)
    localStorage.setItem(VIEW_KEY, next)
  }

  function toggleDemo() {
    setDemo((prev) => {
      const next = !prev
      writeCrmDemo(next)
      return next
    })
  }

  const deals = demo ? CRM_DEMO_DEALS : liveDeals
  const industries = useMemo(() => {
    const extra = deals.map((item) => item.industry).filter(Boolean) as string[]
    return Array.from(new Set([...INDUSTRIES, ...extra]))
  }, [deals])
  const regions = country === 'all' ? [] : (REGIONS_BY_COUNTRY[country] ?? [])
  const sourceOptions = sourceType === 'project' ? sources.projects : sources.infovods

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const range = BUDGET_FILTERS.find((item) => item.id === budget)
    return deals.filter((item) => {
      if (stage !== 'all' && item.stage !== stage) return false
      if (source !== 'all' && item.sourceType !== source) return false
      if (industry !== 'all' && item.industry !== industry) return false
      if (country !== 'all' && item.country !== country) return false
      if (region !== 'all' && item.region !== region) return false
      if (range) {
        if (item.budget == null) return false
        if (item.budget < range.min || item.budget >= range.max) return false
      }
      if (overdueOnly) {
        if (!item.nextTouchAt || Date.parse(item.nextTouchAt) >= Date.now()) return false
      }
      if (!q) return true
      return `${item.name} ${item.grantor} ${item.owner} ${item.industry} ${item.region} ${item.contacts.map((c) => c.name).join(' ')}`
        .toLowerCase()
        .includes(q)
    })
  }, [deals, query, stage, source, industry, country, region, budget, overdueOnly])

  async function onCreate() {
    if (!sourceId) {
      setError('Выберите объект анализа или инфоповод')
      return
    }
    setSaving(true)
    setError('')
    try {
      const result = await createCrmDeal({
        sourceType,
        projectId: sourceType === 'project' ? sourceId : undefined,
        infovodId: sourceType === 'infovod' ? sourceId : undefined,
      })
      writeCrmDemo(false)
      setDemo(false)
      navigate(`/crm/${result.deal.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  async function saveMail() {
    setSaving(true)
    setMailNote('')
    setError('')
    try {
      const next = await putCrmMail({
        host: mail.host,
        port: mail.port,
        secure: mail.secure,
        user: mail.user,
        from: mail.from,
        fromName: mail.fromName,
        password: password || undefined,
      })
      setMail(next)
      setPassword('')
      setMailNote('Почта сохранена')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  async function testMail() {
    setSaving(true)
    setMailNote('')
    setError('')
    try {
      const result = await testCrmMail()
      setMailNote(result.ok ? `SMTP отвечает: ${result.host}` : 'SMTP не отвечает')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  function resetFilters() {
    setQuery('')
    setStage('all')
    setSource('all')
    setIndustry('all')
    setCountry('all')
    setRegion('all')
    setBudget('all')
    setOverdueOnly(false)
  }

  return (
    <section className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">Работа с контрагентами</p>
          <h1>CRM</h1>
          <p className="lede">
            Карточка заводится от объекта анализа или инфоповода. Сверху — пайплайн: где сейчас основная масса клиентов.
          </p>
        </div>
        <div className="actions">
          <button type="button" className={`btn ${demo ? 'btn--primary' : ''}`} onClick={toggleDemo} aria-pressed={demo}>
            {demo ? 'Выключить демо' : 'Демо-режим'}
          </button>
          <button type="button" className="btn btn--primary" onClick={() => setCreating((prev) => !prev)}>
            <IconPlus />
            {creating ? 'Скрыть форму' : 'Завести карточку'}
          </button>
        </div>
      </div>

      {!apiOnline && <div className="banner">API недоступен — живые карточки только с сервером. Демо можно смотреть и так.</div>}
      {error && <div className="banner banner--danger">{error}</div>}
      {demo && (
        <div className="banner">
          Демо-режим: показана заполненная воронка. Учебные карточки в базу не пишутся, письма и правки с них не уходят.
        </div>
      )}

      {creating && (
        <div className="card settings-block">
          <h2>Повод для карточки</h2>
          <div className="chips">
            <button type="button" className={`chip ${sourceType === 'project' ? 'is-on' : ''}`} onClick={() => { setSourceType('project'); setSourceId('') }}>
              Объект анализа
            </button>
            <button type="button" className={`chip ${sourceType === 'infovod' ? 'is-on' : ''}`} onClick={() => { setSourceType('infovod'); setSourceId('') }}>
              Инфоповод
            </button>
          </div>
          <label className="field">
            {sourceType === 'project' ? 'Выберите объект' : 'Выберите инфоповод'}
            <select value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
              <option value="">—</option>
              {sourceOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                  {item.taken ? ' · уже в CRM' : ''}
                  {item.region ? ` · ${item.region}` : ''}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="btn btn--primary" disabled={!apiOnline || saving || !sourceId} onClick={() => void onCreate()}>
            {saving ? 'Создаю…' : 'Открыть карточку'}
          </button>
        </div>
      )}

      {loading && !demo ? (
        <div className="empty">
          <h3>Загружаю CRM</h3>
        </div>
      ) : (
        <>
          <div className="chips" role="tablist" aria-label="Разделы CRM">
            <button type="button" className={`chip ${tab === 'feed' ? 'is-on' : ''}`} onClick={() => setTab('feed')}>
              Воронка и карточки
            </button>
            <button type="button" className={`chip ${tab === 'mail' ? 'is-on' : ''}`} onClick={() => setTab('mail')}>
              Почта SMTP
            </button>
          </div>

          {tab === 'feed' && (
            <>
              <CrmFunnel deals={deals} active={stage} onPick={setStage} />

              <div className="filters">
                <label className="search">
                  <IconSearch />
                  <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Название, концедент, контакт" />
                </label>
                <div className="chips">
                  {CRM_SOURCE_FILTERS.map((item) => (
                    <button key={item.id} type="button" className={`chip ${source === item.id ? 'is-on' : ''}`} onClick={() => setSource(item.id)}>
                      {item.label}
                    </button>
                  ))}
                  <button type="button" className={`chip ${overdueOnly ? 'is-on' : ''}`} onClick={() => setOverdueOnly((prev) => !prev)}>
                    Просроченные касания
                  </button>
                </div>
                <div className="filter-row">
                  <label>
                    Отрасль
                    <select value={industry} onChange={(e) => setIndustry(e.target.value)}>
                      <option value="all">Все отрасли</option>
                      {industries.map((item) => (
                        <option key={item} value={item}>{item}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Страна
                    <select value={country} onChange={(e) => { setCountry(e.target.value); setRegion('all') }}>
                      <option value="all">Все страны</option>
                      {COUNTRIES.map((item) => (
                        <option key={item} value={item}>{item}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Регион
                    <select value={region} onChange={(e) => setRegion(e.target.value)} disabled={country === 'all'}>
                      <option value="all">Все регионы</option>
                      {regions.map((item) => (
                        <option key={item} value={item}>{item}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Бюджет
                    <select value={budget} onChange={(e) => setBudget(e.target.value)}>
                      <option value="all">Любой бюджет</option>
                      {BUDGET_FILTERS.map((item) => (
                        <option key={item.id} value={item.id}>{item.label}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="filters__foot">
                  <span>Показано {filtered.length} из {deals.length}</span>
                  <div className="view-toggle" role="group" aria-label="Вид списка">
                    <button type="button" className={view === 'board' ? 'is-on' : ''} aria-pressed={view === 'board'} onClick={() => changeView('board')}>
                      <IconKanban />
                      Воронка
                    </button>
                    <button type="button" className={view === 'row' ? 'is-on' : ''} aria-pressed={view === 'row'} onClick={() => changeView('row')}>
                      <IconRows />
                      Таблица
                    </button>
                    <button type="button" className={view === 'tile' ? 'is-on' : ''} aria-pressed={view === 'tile'} onClick={() => changeView('tile')}>
                      <IconGrid />
                      Плитка
                    </button>
                  </div>
                  <button type="button" className="btn btn--ghost" onClick={resetFilters}>
                    Сбросить фильтры
                  </button>
                </div>
              </div>

              {!filtered.length ? (
                <div className="empty">
                  <h3>{deals.length ? 'Ничего не совпало с фильтром' : 'В CRM пока пусто'}</h3>
                  <p>
                    {deals.length
                      ? 'Снимите часть фильтров или сбросьте пайплайн.'
                      : 'Заведите карточку от проекта или инфоповода — либо включите демо-режим, чтобы увидеть заполненную воронку.'}
                  </p>
                  {!deals.length && (
                    <button type="button" className="btn btn--primary" onClick={toggleDemo}>
                      Включить демо-режим
                    </button>
                  )}
                </div>
              ) : view === 'board' ? (
                <div className="kanban">
                  {CRM_STAGES.filter((column) => stage === 'all' || column.id === stage).map((column) => {
                    const items = filtered.filter((item) => item.stage === column.id)
                    return (
                      <section key={column.id} className="kanban__col">
                        <h3>
                          {column.label}
                          <span>{items.length}</span>
                        </h3>
                        {items.map((item) => (
                          <CrmCard key={item.id} item={item} />
                        ))}
                      </section>
                    )
                  })}
                </div>
              ) : view === 'row' ? (
                <div className="rows crm-grid">
                  <div className="rows__head crm-grid__head">
                    <span>Стадия</span>
                    <span>Карточка</span>
                    <span>Повод</span>
                    <span>Отрасль</span>
                    <span>Локация</span>
                    <span>Бюджет</span>
                    <span>Касание</span>
                    <span>Ответственный</span>
                  </div>
                  {filtered.map((item) => (
                    <CrmCard key={item.id} item={item} variant="row" />
                  ))}
                </div>
              ) : (
                <div className="grid">
                  {filtered.map((item) => (
                    <CrmCard key={item.id} item={item} />
                  ))}
                </div>
              )}
            </>
          )}

          {tab === 'mail' && (
            <div className="card settings-block">
              <h2>Исходящая почта</h2>
              <p className="hint">
                SMTP корпоративного ящика. После сохранения с карточки CRM можно отправить письмо контакту — оно попадёт в
                ленту касаний.
              </p>
              {mail.connected && <p className="hint">Подключено: {mail.user} · {mail.host}</p>}
              {!canEditMail && <p className="hint">Менять SMTP может администратор.</p>}
              <div className="filter-row">
                <label className="field">
                  SMTP-сервер
                  <input value={mail.host} disabled={!canEditMail} onChange={(e) => setMail((prev) => ({ ...prev, host: e.target.value }))} placeholder="smtp.mail.ru" />
                </label>
                <label className="field">
                  Порт
                  <input type="number" value={mail.port} disabled={!canEditMail} onChange={(e) => setMail((prev) => ({ ...prev, port: Number(e.target.value) }))} />
                </label>
                <label className="field">
                  Логин
                  <input value={mail.user} disabled={!canEditMail} onChange={(e) => setMail((prev) => ({ ...prev, user: e.target.value }))} placeholder="user@company.ru" />
                </label>
                <label className="field">
                  Пароль / ключ приложения
                  <input type="password" value={password} disabled={!canEditMail} onChange={(e) => setPassword(e.target.value)} placeholder={mail.hasPassword ? 'сохранён, введите чтобы заменить' : 'пароль SMTP'} />
                </label>
              </div>
              <div className="filter-row">
                <label className="field">
                  От кого (email)
                  <input value={mail.from} disabled={!canEditMail} onChange={(e) => setMail((prev) => ({ ...prev, from: e.target.value }))} placeholder="тот же ящик или alias" />
                </label>
                <label className="field">
                  Имя отправителя
                  <input value={mail.fromName} disabled={!canEditMail} onChange={(e) => setMail((prev) => ({ ...prev, fromName: e.target.value }))} />
                </label>
                <label className="field">
                  Шифрование
                  <select value={mail.secure ? 'ssl' : 'starttls'} disabled={!canEditMail} onChange={(e) => setMail((prev) => ({ ...prev, secure: e.target.value === 'ssl' }))}>
                    <option value="starttls">STARTTLS (обычно 587)</option>
                    <option value="ssl">SSL/TLS (обычно 465)</option>
                  </select>
                </label>
              </div>
              {mailNote && <p className="hint">{mailNote}</p>}
              {canEditMail && (
                <div className="actions">
                  <button type="button" className="btn" disabled={saving} onClick={() => void saveMail()}>
                    Сохранить
                  </button>
                  <button type="button" className="btn btn--ghost" disabled={saving || !mail.hasPassword} onClick={() => void testMail()}>
                    Проверить соединение
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </section>
  )
}
