import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  createUser,
  deleteUser,
  fetchSystemSettings,
  fetchUsers,
  patchUser,
  putSystemSettings,
} from '../api/client'
import type { AuthUser, SystemSettings } from '../api/client'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'

export function AccessSettings() {
  const { apiOnline } = useApp()
  const { enabled, isAdmin, refresh } = useAuth()
  const navigate = useNavigate()
  const [system, setSystem] = useState<SystemSettings | null>(null)
  const [users, setUsers] = useState<AuthUser[]>([])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const canToggle = !enabled || isAdmin

  async function load() {
    if (!apiOnline) return
    setError('')
    try {
      const next = await fetchSystemSettings()
      setSystem(next)
      if (next.authEnabled && isAdmin) setUsers(await fetchUsers())
      else setUsers([])
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  useEffect(() => {
    void load()
  }, [apiOnline, isAdmin, enabled])

  async function toggleAuth(authEnabled: boolean) {
    setSaving(true)
    setError('')
    try {
      const next = await putSystemSettings(authEnabled)
      setSystem(next)
      await refresh()
      if (next.authEnabled && next.setupRequired) {
        navigate('/login', { replace: true })
        return
      }
      if (next.authEnabled && isAdmin) setUsers(await fetchUsers())
      else setUsers([])
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const checked = system?.authEnabled ?? enabled

  return (
    <div className="stack">
      <div className="card settings-block">
        <h2>Работа по авторизации</h2>
        <p className="hint">
          По умолчанию система открыта без входа. Если включить галочку, первый созданный пользователь станет
          администратором: он приглашает коллег и может назначать других администраторами. Обычный пользователь
          работает с проектами и мастером промпта.
        </p>
        <label className="check">
          <input
            type="checkbox"
            checked={checked}
            disabled={!apiOnline || saving || !canToggle}
            onChange={(event) => void toggleAuth(event.target.checked)}
          />
          <span>
            <strong>Включить авторизацию</strong>
            <em>
              {canToggle
                ? 'Без галочки вход не нужен — как сейчас. С галочкой доступ только по логину.'
                : 'Изменить может только администратор.'}
            </em>
          </span>
        </label>
        {system?.setupRequired && (
          <p className="hint">Авторизация включена, но администратора ещё нет — откроется экран создания.</p>
        )}
      </div>

      {error && <div className="banner banner--danger">{error}</div>}

      {checked && isAdmin && (
        <UsersAdmin users={users} onChange={setUsers} onError={setError} />
      )}
    </div>
  )
}

function UsersAdmin({
  users,
  onChange,
  onError,
}: {
  users: AuthUser[]
  onChange: (users: AuthUser[]) => void
  onError: (message: string) => void
}) {
  const [name, setName] = useState('')
  const [loginName, setLoginName] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'user' | 'admin'>('user')
  const [invite, setInvite] = useState(true)
  const [busy, setBusy] = useState(false)
  const [inviteLink, setInviteLink] = useState('')

  async function reload() {
    onChange(await fetchUsers())
  }

  async function onCreate(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    onError('')
    setInviteLink('')
    try {
      const result = await createUser({
        name,
        login: loginName,
        role,
        invite,
        password: invite ? undefined : password,
      })
      if (result.invitePath) {
        setInviteLink(`${window.location.origin}${result.invitePath}`)
      }
      setName('')
      setLoginName('')
      setPassword('')
      setRole('user')
      setInvite(true)
      await reload()
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function setRoleFor(user: AuthUser, nextRole: 'user' | 'admin') {
    setBusy(true)
    onError('')
    try {
      await patchUser(user.id, { role: nextRole })
      await reload()
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function remove(user: AuthUser) {
    if (!window.confirm(`Удалить ${user.name} (${user.login})?`)) return
    setBusy(true)
    onError('')
    try {
      await deleteUser(user.id)
      await reload()
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function copyLink() {
    if (!inviteLink) return
    await navigator.clipboard.writeText(inviteLink).catch(() => undefined)
  }

  return (
    <div className="card settings-block">
      <h2>Пользователи</h2>
      <p className="hint">Администратор создаёт учётку сразу с паролем или выдаёт ссылку-приглашение на 14 дней.</p>

      {inviteLink && (
        <div className="banner">
          <span>Ссылка приглашения: {inviteLink}</span>
          <button type="button" className="btn btn--ghost" onClick={() => void copyLink()}>
            Скопировать
          </button>
        </div>
      )}

      <form className="stack" onSubmit={(event) => void onCreate(event)}>
        <div className="filter-row">
          <label className="field">
            Имя
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label className="field">
            Логин
            <input value={loginName} onChange={(e) => setLoginName(e.target.value)} autoComplete="off" required />
          </label>
        </div>
        <div className="chips">
          <button type="button" className={`chip ${role === 'user' ? 'is-on' : ''}`} onClick={() => setRole('user')}>
            Пользователь
          </button>
          <button type="button" className={`chip ${role === 'admin' ? 'is-on' : ''}`} onClick={() => setRole('admin')}>
            Администратор
          </button>
          <button type="button" className={`chip ${invite ? 'is-on' : ''}`} onClick={() => setInvite(true)}>
            Пригласить ссылкой
          </button>
          <button type="button" className={`chip ${!invite ? 'is-on' : ''}`} onClick={() => setInvite(false)}>
            Сразу с паролем
          </button>
        </div>
        {!invite && (
          <label className="field">
            Пароль
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
              autoComplete="new-password"
            />
          </label>
        )}
        <button type="submit" className="btn btn--primary" disabled={busy}>
          {busy ? 'Сохраняю…' : invite ? 'Создать и выдать ссылку' : 'Создать пользователя'}
        </button>
      </form>

      <div className="table-wrap">
        <table className="users-table">
          <thead>
            <tr>
              <th>Имя</th>
              <th>Логин</th>
              <th>Роль</th>
              <th>Статус</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td data-label="Имя">{user.name}</td>
                <td data-label="Логин">{user.login}</td>
                <td data-label="Роль">{user.role === 'admin' ? 'администратор' : 'пользователь'}</td>
                <td data-label="Статус">{user.pendingInvite ? 'ждёт пароль' : 'активен'}</td>
                <td className="users-table__actions" data-label="Действия">
                  {user.role === 'user' ? (
                    <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => void setRoleFor(user, 'admin')}>
                      Сделать админом
                    </button>
                  ) : (
                    <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => void setRoleFor(user, 'user')}>
                      Снять админа
                    </button>
                  )}
                  <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => void remove(user)}>
                    Удалить
                  </button>
                </td>
              </tr>
            ))}
            {!users.length && (
              <tr className="users-table__empty">
                <td colSpan={5}>Пока только вы — пригласите коллег.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
