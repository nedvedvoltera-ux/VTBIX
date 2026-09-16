import { useEffect, useMemo, useState } from 'react'
import {
  clearMediaHits,
  fetchMediaConfig,
  fetchMediaHits,
  fetchMediaStatus,
  patchMediaHit,
  putMediaConfig,
  runMediaMonitor,
} from '../api/client'
import { InfovodCard } from '../components/InfovodCard'
import { IconSearch } from '../components/Icons'
import { useApp } from '../context/AppContext'
import { BUDGET_FILTERS, COUNTRIES, INDUSTRIES, INFOVOD_DECISION_FILTERS, INFOVOD_FIT_FILTERS, REGIONS_BY_COUNTRY } from '../data/mock'
import type { InfovodDecision, MediaFit, MediaPromptConfig, MediaPublication, MediaStatus } from '../types'
import { buildMediaPreview, DEFAULT_MEDIA_PROMPT, normalizeDomain } from '../utils/mediaPrompt'

const STAGE_LABEL: Record<string, string> = {
  searching: 'Веб-поиск',
  fetching: 'Чтение страниц',
  analyzing: 'Разбор моделью',
  processing: 'В работе',
  done: 'Готово',
  error: 'Ошибка',
}

function addUnique(list: string[], value: string) {
  const next = value.trim()
  if (!next) return list
  const key = next.toLowerCase()
  if (list.some((item) => item.toLowerCase() === key)) return list
  return [...list, next]
}

export function MediaMonitorPage() {
  const { apiOnline } = useApp()
  const [prompt, setPrompt] = useState<MediaPromptConfig>(DEFAULT_MEDIA_PROMPT)
  const [hits, setHits] = useState<MediaPublication[]>([])
  const [status, setStatus] = useState<MediaStatus | null>(null)
  const [keywordDraft, setKeywordDraft] = useState('')
  const [siteDraft, setSiteDraft] = useState('')
  const [query, setQuery] = useState('')
  const [fit, setFit] = useState<'all' | MediaFit>('all')
  const [decision, setDecision] = useState<'all' | InfovodDecision>('all')
  const [industry, setIndustry] = useState('all')
  const [country, setCountry] = useState('all')
  const [region, setRegion] = useState('all')
  const [budget, setBudget] = useState('all')
  const [tab, setTab] = useState<'feed' | 'search'>('feed')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [running, setRunning] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const preview = useMemo(() => buildMediaPreview(prompt), [prompt])
  const busy = running || Boolean(status?.running)

  async function loadAll() {
    if (!apiOnline) {
      setLoading(false)
      return
    }
    setError('')
    try {
      const [nextPrompt, nextHits, nextStatus] = await Promise.all([
        fetchMediaConfig(),
        fetchMediaHits(),
        fetchMediaStatus(),
      ])
      setPrompt(nextPrompt)
      setHits(nextHits)
      setStatus(nextStatus)
      setRunning(Boolean(nextStatus.running))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadAll()
  }, [apiOnline])

  useEffect(() => {
    if (!busy || !apiOnline) return undefined
    const timer = window.setInterval(() => {
      void fetchMediaStatus()
        .then(async (next) => {
          setStatus(next)
          setRunning(Boolean(next.running))
          if (!next.running) setHits(await fetchMediaHits())
        })
        .catch(() => undefined)
    }, 2000)
    return () => window.clearInterval(timer)
  }, [busy, apiOnline])

  function patch(partial: Partial<MediaPromptConfig>) {
    setSaved(false)
    setPrompt((prev) => ({ ...prev, ...partial }))
  }

  async function save() {
    setSaving(true)
    setError('')
    try {
      const next = await putMediaConfig(prompt)
      setPrompt(next)
      setSaved(true)
      return next
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      return null
    } finally {
      setSaving(false)
    }
  }

  async function run() {
    setError('')
    const stored = await save()
    if (!stored) return
    setRunning(true)
    try {
      const result = await runMediaMonitor()
      setStatus({ running: true, job: result.job })
    } catch (err) {
      setRunning(false)
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function onDecision(id: string, next: InfovodDecision) {
    try {
      const savedHit = await patchMediaHit(id, { decision: next })
      setHits((prev) => prev.map((item) => (item.id === id ? savedHit : item)))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function clearHits() {
    if (!window.confirm('Очистить ленту инфоповодов? Решения по карточкам тоже сбросятся.')) return
    await clearMediaHits()
    setHits([])
  }

  function resetFilters() {
    setQuery('')
    setFit('all')
    setDecision('all')
    setIndustry('all')
    setCountry('all')
    setRegion('all')
    setBudget('all')
  }

  const industries = useMemo(() => {
    const extra = hits.map((item) => item.industry).filter(Boolean) as string[]
    return Array.from(new Set([...INDUSTRIES, ...extra]))
  }, [hits])

  const regions = country === 'all' ? [] : (REGIONS_BY_COUNTRY[country] ?? [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const range = BUDGET_FILTERS.find((item) => item.id === budget)
    return hits.filter((item) => {
      if (fit !== 'all' && item.fit !== fit) return false
      if (decision !== 'all' && item.decision !== decision) return false
      if (industry !== 'all' && item.industry !== industry) return false
      if (country !== 'all' && item.country !== country) return false
      if (region !== 'all' && item.region !== region) return false
      if (range) {
        if (item.budgetEstimate == null) return false
        if (item.budgetEstimate < range.min || item.budgetEstimate >= range.max) return false
      }
      if (!q) return true
      return `${item.name} ${item.title} ${item.projectName} ${item.region} ${item.country} ${item.industry} ${item.grantor} ${item.source}`
        .toLowerCase()
        .includes(q)
    })
  }, [hits, query, fit, decision, industry, country, region, budget])

  const stats = useMemo(
    () => ({
      total: hits.length,
      fresh: hits.filter((item) => item.decision === 'new').length,
      pursue: hits.filter((item) => item.decision === 'pursue' || item.decision === 'watch').length,
      high: hits.filter((item) => item.fit === 'high').length,
    }),
    [hits],
  )

  const job = status?.job
  const stageText = job?.stage ? STAGE_LABEL[job.stage] || job.stage : ''

  return (
    <section className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">Мониторинг СМИ</p>
          <h1>Инфоповоды</h1>
          <p className="lede">
            Релевантные публикации складываются в карточки-триггеры: регион, отрасль, концедент и решение — взять в
            работу, держать на контроле или завести объект анализа.
          </p>
        </div>
        <div className="actions">
          <button type="button" className="btn btn--ghost" disabled={!apiOnline || saving || busy} onClick={() => void save()}>
            {saving ? 'Сохраняю…' : saved ? 'Промпт сохранён' : 'Сохранить промпт'}
          </button>
          <button type="button" className="btn btn--primary" disabled={!apiOnline || busy} onClick={() => void run()}>
            {busy ? `${stageText || 'Идёт поиск'}…` : 'Запустить мониторинг'}
          </button>
        </div>
      </div>

      {!apiOnline && <div className="banner">API недоступен — мониторинг работает только с сервером.</div>}
      {error && <div className="banner banner--danger">{error}</div>}
      {job?.status === 'error' && job.error && <div className="banner banner--danger">{job.error}</div>}
      {job?.status === 'done' && job.stats && (
        <div className="banner">
          Последний прогон: найдено {job.stats.found ?? '—'}, прочитано {job.stats.pages ?? '—'}, в ленту попало{' '}
          {job.stats.kept ?? '—'}. {job.stats.provider ? `Поиск: ${job.stats.provider}.` : ''}
        </div>
      )}

      {loading ? (
        <div className="empty">
          <h3>Загружаю мониторинг</h3>
        </div>
      ) : (
        <>
          <div className="chips" role="tablist" aria-label="Разделы мониторинга">
            <button type="button" className={`chip ${tab === 'feed' ? 'is-on' : ''}`} onClick={() => setTab('feed')}>
              Инфоповоды
            </button>
            <button type="button" className={`chip ${tab === 'search' ? 'is-on' : ''}`} onClick={() => setTab('search')}>
              Поиск и промпт
            </button>
          </div>

          {tab === 'feed' && (
            <>
              <div className="stats">
                <article className="stat">
                  <span>Всего инфоповодов</span>
                  <strong>{stats.total}</strong>
                </article>
                <article className="stat stat--warn">
                  <span>Ждут решения</span>
                  <strong>{stats.fresh}</strong>
                </article>
                <article className="stat stat--ok">
                  <span>В работе / на контроле</span>
                  <strong>{stats.pursue}</strong>
                </article>
                <article className="stat">
                  <span>Сильный сигнал</span>
                  <strong>{stats.high}</strong>
                </article>
              </div>

              <div className="filters">
                <label className="search">
                  <IconSearch />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Название, концедент, регион, издание"
                  />
                </label>
                <div className="chips" role="tablist" aria-label="Решение">
                  {INFOVOD_DECISION_FILTERS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`chip ${decision === item.id ? 'is-on' : ''}`}
                      onClick={() => setDecision(item.id)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                <div className="chips" role="tablist" aria-label="Сигнал концессии">
                  {INFOVOD_FIT_FILTERS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`chip ${fit === item.id ? 'is-on' : ''}`}
                      onClick={() => setFit(item.id)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                <div className="filter-row">
                  <label>
                    Отрасль
                    <select value={industry} onChange={(e) => setIndustry(e.target.value)}>
                      <option value="all">Все отрасли</option>
                      {industries.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Страна
                    <select
                      value={country}
                      onChange={(e) => {
                        setCountry(e.target.value)
                        setRegion('all')
                      }}
                    >
                      <option value="all">Все страны</option>
                      {COUNTRIES.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Регион
                    <select value={region} onChange={(e) => setRegion(e.target.value)} disabled={country === 'all'}>
                      <option value="all">Все регионы</option>
                      {regions.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Бюджет
                    <select value={budget} onChange={(e) => setBudget(e.target.value)}>
                      <option value="all">Любой бюджет</option>
                      {BUDGET_FILTERS.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="filters__foot">
                  <span>
                    Показано {filtered.length} из {hits.length}
                  </span>
                  <button type="button" className="btn btn--ghost" onClick={resetFilters}>
                    Сбросить фильтры
                  </button>
                  <button type="button" className="btn btn--ghost" disabled={!hits.length} onClick={() => void clearHits()}>
                    Очистить ленту
                  </button>
                </div>
              </div>

              {!filtered.length ? (
                <div className="empty">
                  <h3>{hits.length ? 'Ничего не совпало с фильтром' : 'Пока нет инфоповодов'}</h3>
                  <p>
                    {hits.length
                      ? 'Снимите часть фильтров.'
                      : 'Откройте «Поиск и промпт» и запустите мониторинг — карточки появятся здесь.'}
                  </p>
                </div>
              ) : (
                <div className="grid">
                  {filtered.map((item) => (
                    <InfovodCard key={item.id} item={item} onDecision={(id, next) => void onDecision(id, next)} />
                  ))}
                </div>
              )}
            </>
          )}

          {tab === 'search' && (
          <div className="split split--prompt">
            <div className="stack">
              <div className="card settings-block">
                <h2>Где искать</h2>
                <div className="chips">
                  <button
                    type="button"
                    className={`chip ${prompt.searchMode === 'sites' ? 'is-on' : ''}`}
                    onClick={() => patch({ searchMode: 'sites' })}
                  >
                    Список сайтов
                  </button>
                  <button
                    type="button"
                    className={`chip ${prompt.searchMode === 'web' ? 'is-on' : ''}`}
                    onClick={() => patch({ searchMode: 'web' })}
                  >
                    Свободный веб-поиск
                  </button>
                </div>
                <p className="hint">
                  {prompt.searchMode === 'sites'
                    ? 'Запросы идут на указанные домены (RSS и site:…). Добавьте отраслевые и региональные СМИ.'
                    : 'Поиск по открытому вебу, без ограничения доменом. Шума будет больше — модель отфильтрует.'}
                </p>
                <div className="filter-row">
                  <label className="field">
                    Глубина, дни
                    <input
                      type="number"
                      min={1}
                      max={90}
                      value={prompt.lookbackDays}
                      onChange={(e) => patch({ lookbackDays: Number(e.target.value) })}
                    />
                  </label>
                  <label className="field">
                    Сколько страниц отдать модели
                    <input
                      type="number"
                      min={4}
                      max={24}
                      value={prompt.maxResults}
                      onChange={(e) => patch({ maxResults: Number(e.target.value) })}
                    />
                  </label>
                </div>
              </div>

              <div className="card settings-block">
                <h2>Ключевые слова</h2>
                <div className="chips">
                  {prompt.keywords.map((word) => (
                    <button
                      key={word}
                      type="button"
                      className="chip chip--dismiss"
                      onClick={() => patch({ keywords: prompt.keywords.filter((item) => item !== word) })}
                    >
                      {word} ×
                    </button>
                  ))}
                </div>
                <div className="inline-add">
                  <input
                    value={keywordDraft}
                    placeholder="концессия, ГЧП, кампус…"
                    onChange={(e) => setKeywordDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter') return
                      e.preventDefault()
                      patch({ keywords: addUnique(prompt.keywords, keywordDraft) })
                      setKeywordDraft('')
                    }}
                  />
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      patch({ keywords: addUnique(prompt.keywords, keywordDraft) })
                      setKeywordDraft('')
                    }}
                  >
                    Добавить
                  </button>
                </div>
              </div>

              <div className="card settings-block">
                <h2>Сайты</h2>
                <div className="chips">
                  {prompt.sites.map((site) => (
                    <button
                      key={site}
                      type="button"
                      className="chip chip--dismiss"
                      onClick={() => patch({ sites: prompt.sites.filter((item) => item !== site) })}
                    >
                      {site} ×
                    </button>
                  ))}
                </div>
                <div className="inline-add">
                  <input
                    value={siteDraft}
                    placeholder="interfax.ru или https://tass.ru"
                    onChange={(e) => setSiteDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter') return
                      e.preventDefault()
                      patch({ sites: addUnique(prompt.sites, normalizeDomain(siteDraft) || siteDraft) })
                      setSiteDraft('')
                    }}
                  />
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      patch({ sites: addUnique(prompt.sites, normalizeDomain(siteDraft) || siteDraft) })
                      setSiteDraft('')
                    }}
                  >
                    Добавить
                  </button>
                </div>
              </div>

              <div className="card settings-block">
                <h2>Промпт для модели</h2>
                <label className="field">
                  Системная роль
                  <textarea rows={5} value={prompt.role} onChange={(e) => patch({ role: e.target.value })} />
                </label>
                <label className="field">
                  Дополнительные указания
                  <textarea
                    rows={4}
                    value={prompt.extraInstructions}
                    onChange={(e) => patch({ extraInstructions: e.target.value })}
                  />
                </label>
                <label>
                  Язык карточек
                  <select
                    value={prompt.language}
                    onChange={(e) => patch({ language: e.target.value as MediaPromptConfig['language'] })}
                  >
                    <option value="ru">Русский</option>
                    <option value="en">English</option>
                  </select>
                </label>
              </div>
            </div>

            <aside className="prompt-preview">
              <div className="prompt-preview__bar">
                <strong>Что уйдёт в LLM</strong>
                <p className="hint">После поиска сниппеты дописываются к этой инструкции.</p>
              </div>
              <pre>{preview}</pre>
            </aside>
          </div>
          )}
        </>
      )}
    </section>
  )
}
