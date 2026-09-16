import { useEffect, useMemo, useState } from 'react'
import { fetchLlmSettings, probeLlm, putLlmSettings } from '../api/client'
import type { LlmProbe, LlmProviderOption, LlmSettings } from '../api/client'
import { AccessSettings } from '../components/AccessSettings'
import { SettingsNav } from '../components/SettingsNav'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'

type FormState = {
  source: 'local' | 'cloud'
  provider: string
  model: string
  baseUrl: string
  apiKey: string
}

function emptyForm(): FormState {
  return { source: 'local', provider: 'openai', model: '', baseUrl: '', apiKey: '' }
}

function formFromSettings(settings: LlmSettings): FormState {
  return {
    source: settings.source,
    provider: settings.provider || 'openai',
    model: settings.model || '',
    baseUrl: settings.baseUrl || '',
    apiKey: '',
  }
}

export function SettingsPage() {
  const { apiOnline } = useApp()
  const { enabled, isAdmin } = useAuth()
  const canEditLlm = !enabled || isAdmin
  const [settings, setSettings] = useState<LlmSettings | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [probe, setProbe] = useState<LlmProbe | null>(null)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const next = await fetchLlmSettings()
      setSettings(next)
      setForm(formFromSettings(next))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!apiOnline || !canEditLlm) {
      setLoading(false)
      return
    }
    void load()
  }, [apiOnline, canEditLlm])

  const providers = settings?.providers ?? []
  const provider = useMemo(
    () => providers.find((item) => item.id === form.provider) ?? providers[0],
    [providers, form.provider],
  )

  function patch(partial: Partial<FormState>) {
    setSaved(false)
    setForm((prev) => ({ ...prev, ...partial }))
  }

  function onProviderChange(id: string) {
    const next = providers.find((item) => item.id === id)
    patch({
      provider: id,
      model: next?.models[0] || '',
      baseUrl: next?.allowCustomUrl ? form.baseUrl : next?.baseUrl || '',
    })
  }

  async function save(extra: Partial<Parameters<typeof putLlmSettings>[0]> = {}) {
    setSaving(true)
    setError('')
    try {
      const payload =
        form.source === 'local'
          ? { source: 'local' as const, ...extra }
          : {
              source: 'cloud' as const,
              provider: form.provider,
              model: form.model,
              baseUrl: form.baseUrl,
              apiKey: form.apiKey.trim() || undefined,
              ...extra,
            }
      const next = await putLlmSettings(payload)
      setSettings(next)
      setForm(formFromSettings(next))
      setSaved(true)
      return next
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      return null
    } finally {
      setSaving(false)
    }
  }

  async function saveAndTest() {
    const next = await save()
    if (!next) return
    setTesting(true)
    try {
      const result = await probeLlm(true)
      setProbe(result)
    } finally {
      setTesting(false)
    }
  }

  async function clearKey() {
    await save({ clearApiKey: true, apiKey: undefined })
  }

  const modelOptions = provider?.models ?? []
  const customModel = form.model && !modelOptions.includes(form.model)

  return (
    <section className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">Настройки</p>
          <h1>{canEditLlm ? 'Доступ, модель и API' : 'Доступ'}</h1>
          <p className="lede">
            {canEditLlm
              ? 'Авторизация опциональна. Модель по умолчанию — локальная офисная Qwen; облако подключается ключом коммерческой сети.'
              : 'Проекты и мастер промпта доступны вам как пользователю. Параметры модели меняет администратор.'}
          </p>
        </div>
        {canEditLlm && (
          <div className="actions">
            <button type="button" className="btn btn--ghost" disabled={!apiOnline || saving} onClick={() => void load()}>
              Обновить
            </button>
            <button type="button" className="btn" disabled={!apiOnline || saving || testing} onClick={() => void saveAndTest()}>
              {testing ? 'Проверяю…' : 'Сохранить и проверить'}
            </button>
            <button type="button" className="btn btn--primary" disabled={!apiOnline || saving} onClick={() => void save()}>
              {saving ? 'Сохраняю…' : saved ? 'Сохранено' : 'Сохранить'}
            </button>
          </div>
        )}
      </div>

      <SettingsNav />

      <AccessSettings />

      {canEditLlm && !apiOnline && (
        <div className="banner">API недоступен — настройки модели хранятся на сервере и откроются после запуска бэкенда.</div>
      )}

      {canEditLlm && error && <div className="banner banner--danger">{error}</div>}

      {canEditLlm && (loading ? (
        <div className="empty">
          <h3>Загружаю настройки</h3>
        </div>
      ) : (
        <div className="stack settings-llm">
          <div className="card settings-block">
            <h2>Откуда брать модель</h2>
            <div className="chips">
              <button
                type="button"
                className={`chip ${form.source === 'local' ? 'is-on' : ''}`}
                onClick={() => patch({ source: 'local' })}
              >
                Локальная сеть
              </button>
              <button
                type="button"
                className={`chip ${form.source === 'cloud' ? 'is-on' : ''}`}
                onClick={() => {
                  const nextProvider = providers.find((item) => item.id === form.provider) ?? providers[0]
                  patch({
                    source: 'cloud',
                    provider: nextProvider?.id || form.provider,
                    model: form.model || nextProvider?.models[0] || '',
                    baseUrl: nextProvider?.allowCustomUrl ? form.baseUrl : nextProvider?.baseUrl || form.baseUrl,
                  })
                }}
              >
                Облако · публичный API
              </button>
            </div>
            <p className="hint">
              {form.source === 'local'
                ? 'Используется офисная Qwen из .env. Ключ коммерческой сети здесь не нужен.'
                : 'Запросы уходят во внешнюю коммерческую сеть. Ключ хранится в PostgreSQL на сервере, в интерфейс целиком не возвращается.'}
            </p>
          </div>

          {form.source === 'local' ? (
            <div className="card settings-block">
              <h2>Локальная Qwen</h2>
              <p className="hint">Адрес и имя модели задаются при деплое. Сменить их можно в .env / docker-compose.</p>
              <div className="filter-row">
                <label className="field">
                  URL
                  <input readOnly value={settings?.local.url || 'не задан'} />
                </label>
                <label className="field">
                  Модель
                  <input readOnly value={settings?.local.model || 'не задана'} />
                </label>
              </div>
              {!settings?.local.configured && (
                <p className="hint">SUMMARY_API_BASE_URL не задан — локальная модель сейчас недоступна.</p>
              )}
            </div>
          ) : (
            <>
              <div className="card settings-block">
                <h2>Сеть</h2>
                <div className="provider-grid">
                  {providers.map((item: LlmProviderOption) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`provider-card ${form.provider === item.id ? 'is-on' : ''}`}
                      onClick={() => onProviderChange(item.id)}
                    >
                      <strong>{item.name}</strong>
                      <span>{item.network}</span>
                      <em>{item.hint}</em>
                    </button>
                  ))}
                </div>
              </div>

              <div className="card settings-block">
                <h2>Ключ и модель</h2>
                {provider?.docsUrl && (
                  <p className="hint">
                    Ключ берётся в{' '}
                    <a href={provider.docsUrl} target="_blank" rel="noreferrer">
                      кабинете {provider.name}
                    </a>
                    .
                  </p>
                )}
                <label className="field">
                  API-ключ
                  <input
                    type="password"
                    autoComplete="off"
                    placeholder={
                      settings?.hasApiKey
                        ? `сохранён ${settings.apiKeyMasked} — введите новый, чтобы заменить`
                        : provider?.keyHint || 'вставьте ключ'
                    }
                    value={form.apiKey}
                    onChange={(e) => patch({ apiKey: e.target.value })}
                  />
                </label>
                {settings?.hasApiKey && (
                  <button type="button" className="btn btn--ghost" onClick={() => void clearKey()}>
                    Удалить сохранённый ключ
                  </button>
                )}
                {provider?.allowCustomUrl && (
                  <label className="field">
                    Base URL
                    <input
                      placeholder="https://api.example.com/v1"
                      value={form.baseUrl}
                      onChange={(e) => patch({ baseUrl: e.target.value })}
                    />
                  </label>
                )}
                <label className="field">
                  Модель
                  <select
                    value={customModel ? '__custom' : form.model}
                    onChange={(e) => {
                      if (e.target.value === '__custom') {
                        patch({ model: form.model || '' })
                        return
                      }
                      patch({ model: e.target.value })
                    }}
                  >
                    {modelOptions.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                    <option value="__custom">Другая модель…</option>
                  </select>
                </label>
                {(customModel || !modelOptions.length) && (
                  <label className="field">
                    Имя модели
                    <input
                      placeholder="как в кабинете провайдера"
                      value={form.model}
                      onChange={(e) => patch({ model: e.target.value })}
                    />
                  </label>
                )}
              </div>
            </>
          )}

          <div className="card settings-block">
            <h2>Сейчас активно</h2>
            <p>
              {settings?.active.label || '—'}
              {settings?.active.model ? ` · ${settings.active.model}` : ''}
            </p>
            <p className="hint">{settings?.active.url || 'URL не задан'}</p>
            {probe && (
              <p className={probe.ok ? 'hint' : 'hint hint--danger'}>
                {probe.ok
                  ? `Проверка прошла: ${probe.matched ? 'PONG' : probe.reply || 'есть ответ'}${probe.latencyMs != null ? ` · ${probe.latencyMs} мс` : ''}`
                  : `Проверка не прошла: ${probe.error || 'нет ответа'}`}
              </p>
            )}
          </div>
        </div>
      ))}
    </section>
  )
}
