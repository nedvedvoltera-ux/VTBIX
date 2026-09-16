import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { fetchAuthStatus, login as apiLogin, logout as apiLogout, setupAdmin } from '../api/client'
import type { AuthUser } from '../api/client'

type AuthContextValue = {
  loading: boolean
  enabled: boolean
  setupRequired: boolean
  user: AuthUser | null
  isAdmin: boolean
  refresh: () => Promise<void>
  login: (loginName: string, password: string) => Promise<void>
  setup: (payload: { name: string; login: string; password: string }) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [enabled, setEnabled] = useState(false)
  const [setupRequired, setSetupRequired] = useState(false)
  const [user, setUser] = useState<AuthUser | null>(null)

  const refresh = useCallback(async () => {
    try {
      const status = await fetchAuthStatus()
      setEnabled(status.enabled)
      setSetupRequired(status.setupRequired)
      setUser(status.user)
    } catch {
      setEnabled(false)
      setSetupRequired(false)
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const login = useCallback(async (loginName: string, password: string) => {
    const result = await apiLogin(loginName, password)
    setUser(result.user)
    setEnabled(true)
    setSetupRequired(false)
  }, [])

  const setup = useCallback(async (payload: { name: string; login: string; password: string }) => {
    const result = await setupAdmin(payload)
    setUser(result.user)
    setEnabled(true)
    setSetupRequired(false)
  }, [])

  const logout = useCallback(async () => {
    await apiLogout().catch(() => undefined)
    setUser(null)
    await refresh()
  }, [refresh])

  const value = useMemo(
    () => ({
      loading,
      enabled,
      setupRequired,
      user,
      isAdmin: user?.role === 'admin',
      refresh,
      login,
      setup,
      logout,
    }),
    [loading, enabled, setupRequired, user, refresh, login, setup, logout],
  )

  return createElement(AuthContext.Provider, { value }, children)
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
