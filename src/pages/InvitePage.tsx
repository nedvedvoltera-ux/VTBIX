import { useEffect, useState, type FormEvent } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { acceptInvite, fetchInvite } from '../api/client'
import { useAuth } from '../context/AuthContext'

export function InvitePage() {
  const { token } = useParams()
  const navigate = useNavigate()
  const { refresh } = useAuth()
  const [info, setInfo] = useState<{ name: string; login: string } | null>(null)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    if (!token) return
    void fetchInvite(token)
      .then(setInfo)
      .catch(() => setMissing(true))
  }, [token])

  if (!token) return <Navigate to="/login" replace />
  if (missing) {
    return (
      <div className="auth-screen">
        <div className="card settings-block auth-card">
          <h1>Приглашение недействительно</h1>
          <p className="hint">Ссылка истекла или уже использована. Попросите администратора выдать новую.</p>
        </div>
      </div>
    )
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!token) return
    setError('')
    setBusy(true)
    try {
      await acceptInvite(token, password)
      await refresh()
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-screen">
      <form className="card settings-block auth-card" onSubmit={(event) => void onSubmit(event)}>
        <p className="eyebrow">Приглашение</p>
        <h1>Задайте пароль</h1>
        <p className="lede">
          {info ? `${info.name} · логин ${info.login}` : 'Проверяю ссылку…'}
        </p>
        {error && <div className="banner banner--danger">{error}</div>}
        <label className="field">
          Пароль
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
            disabled={!info}
          />
        </label>
        <button type="submit" className="btn btn--primary" disabled={busy || !info}>
          {busy ? 'Сохраняю…' : 'Войти в систему'}
        </button>
      </form>
    </div>
  )
}
