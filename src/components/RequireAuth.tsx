import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export function RequireAuth() {
  const { loading, enabled, setupRequired, user } = useAuth()
  const location = useLocation()

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

  if (enabled && (setupRequired || !user)) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return <Outlet />
}
