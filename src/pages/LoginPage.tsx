import { useState, type FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { putSystemSettings } from '../api/client'
import { useAuth } from '../context/AuthContext'

export function LoginPage() {
  const { loading, enabled, setupRequired, user, login, setup, refresh } = useAuth()
  const location = useLocation()
  const [name, setName] = useState('')
  const [loginName, setLoginName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (loading) {
    return (
      <div className="auth-screen">
        <div className="card settings-block">
          <h1>VTBIH</h1>
          <p className="hint">Проверяю доступ…</p>
        </div>
      </div>
    )
  }

  if (!enabled) return <Navigate to="/" replace />
  if (user && !setupRequired) {
    const from = (location.state as { from?: string } | null)?.from
    return <Navigate to={from || '/'} replace />
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      if (setupRequired) await setup({ name, login: loginName, password })
      else await login(loginName, password)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-screen">
      <form className="card settings-block auth-card" onSubmit={(event) => void onSubmit(event)}>
        <p className="eyebrow">Финансовый отдел</p>
        <h1>{setupRequired ? 'Первый администратор' : 'Вход'}</h1>
        <p className="lede">
          {setupRequired
            ? 'Авторизация включена. Создайте первую учётную запись — она станет администратором системы и сможет приглашать коллег.'
            : 'Введите логин и пароль, выданные администратором.'}
        </p>
        {error && <div className="banner banner--danger">{error}</div>}
        {setupRequired && (
          <label className="field">
            Имя
            <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
          </label>
        )}
        <label className="field">
          Логин
          <input value={loginName} onChange={(e) => setLoginName(e.target.value)} autoComplete="username" required />
        </label>
        <label className="field">
          Пароль
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={setupRequired ? 'new-password' : 'current-password'}
            minLength={8}
            required
          />
        </label>
        <button type="submit" className="btn btn--primary" disabled={busy}>
          {busy ? 'Сохраняю…' : setupRequired ? 'Создать администратора' : 'Войти'}
        </button>
        {setupRequired && (
          <button
            type="button"
            className="btn btn--ghost"
            disabled={busy}
            onClick={() => {
              void (async () => {
                setBusy(true)
                setError('')
                try {
                  await putSystemSettings(false)
                  await refresh()
                } catch (err) {
                  setError(err instanceof Error ? err.message : String(err))
                } finally {
                  setBusy(false)
                }
              })()
            }}
          >
            Отменить и работать без входа
          </button>
        )}
        {!setupRequired && <p className="hint">Нет учётки — попросите администратора ссылку-приглашение.</p>}
      </form>
    </div>
  )
}
