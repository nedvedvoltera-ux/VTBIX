import { beforeEach, describe, expect, it, vi } from 'vitest'

const settings = { authEnabled: false }

vi.mock('../../server/db.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, getAppSettings: () => settings }
})

const { clearSessionCookie, isAuthEnabled, readSessionId, requireAdmin, requireUsersAdmin, setSessionCookie } =
  await import('../../server/auth.js')

function fakeRes() {
  const res = {
    headers: {},
    statusCode: 200,
    body: null,
    setHeader(name, value) {
      res.headers[name] = value
    },
    status(code) {
      res.statusCode = code
      return res
    },
    json(payload) {
      res.body = payload
      return res
    },
  }
  return res
}

beforeEach(() => {
  settings.authEnabled = false
})

describe('readSessionId', () => {
  it('без заголовка cookie возвращает пустую строку', () => {
    expect(readSessionId({ headers: {} })).toBe('')
  })

  it('достаёт токен сессии', () => {
    expect(readSessionId({ headers: { cookie: 'vtbih_session=abc123' } })).toBe('abc123')
  })

  it('находит токен среди других cookie', () => {
    expect(readSessionId({ headers: { cookie: 'theme=dark; vtbih_session=abc123; lang=ru' } })).toBe('abc123')
  })

  it('чужие cookie не путает', () => {
    expect(readSessionId({ headers: { cookie: 'other_session=abc123' } })).toBe('')
  })

  it('раскодирует значение', () => {
    expect(readSessionId({ headers: { cookie: 'vtbih_session=a%20b' } })).toBe('a b')
  })

  it('битую кодировку отдаёт как есть', () => {
    expect(readSessionId({ headers: { cookie: 'vtbih_session=%E0%A4%A' } })).toBe('%E0%A4%A')
  })

  it('мусорные части заголовка игнорируются', () => {
    expect(readSessionId({ headers: { cookie: 'просто-мусор; vtbih_session=abc' } })).toBe('abc')
  })
})

describe('cookie сессии', () => {
  it('ставит защищённую cookie на 14 дней', () => {
    const res = fakeRes()
    setSessionCookie(res, 'token-1')
    const cookie = res.headers['Set-Cookie']
    expect(cookie).toContain('vtbih_session=token-1')
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('Path=/')
    expect(cookie).toContain('SameSite=Lax')
    expect(cookie).toContain(`Max-Age=${14 * 24 * 60 * 60}`)
  })

  it('гасит cookie при выходе', () => {
    const res = fakeRes()
    clearSessionCookie(res)
    const cookie = res.headers['Set-Cookie']
    expect(cookie).toContain('vtbih_session=')
    expect(cookie).toContain('Max-Age=0')
  })

  it('поставленная cookie читается обратно', () => {
    const res = fakeRes()
    setSessionCookie(res, 'token-2')
    const cookie = String(res.headers['Set-Cookie']).split(';')[0]
    expect(readSessionId({ headers: { cookie } })).toBe('token-2')
  })
})

describe('isAuthEnabled', () => {
  it('по умолчанию авторизация выключена', () => {
    expect(isAuthEnabled()).toBe(false)
  })

  it('следует настройке системы', () => {
    settings.authEnabled = true
    expect(isAuthEnabled()).toBe(true)
  })
})

describe('requireAdmin', () => {
  it('при выключенной авторизации пропускает всех', () => {
    const next = vi.fn()
    const res = fakeRes()
    requireAdmin({}, res, next)
    expect(next).toHaveBeenCalledOnce()
    expect(res.statusCode).toBe(200)
  })

  it('пропускает администратора', () => {
    settings.authEnabled = true
    const next = vi.fn()
    requireAdmin({ authUser: { role: 'admin' } }, fakeRes(), next)
    expect(next).toHaveBeenCalledOnce()
  })

  it('обычному пользователю отдаёт 403', () => {
    settings.authEnabled = true
    const next = vi.fn()
    const res = fakeRes()
    requireAdmin({ authUser: { role: 'user' } }, res, next)
    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(403)
    expect(res.body.error).toBe('forbidden')
  })

  it('анонимному запросу отдаёт 403', () => {
    settings.authEnabled = true
    const res = fakeRes()
    requireAdmin({}, res, vi.fn())
    expect(res.statusCode).toBe(403)
  })
})

describe('requireUsersAdmin', () => {
  it('при выключенной авторизации управлять пользователями нельзя', () => {
    const next = vi.fn()
    const res = fakeRes()
    requireUsersAdmin({}, res, next)
    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(403)
    expect(res.body.error).toBe('auth_off')
  })

  it('администратор проходит при включённой авторизации', () => {
    settings.authEnabled = true
    const next = vi.fn()
    requireUsersAdmin({ authUser: { role: 'admin' } }, fakeRes(), next)
    expect(next).toHaveBeenCalledOnce()
  })

  it('обычный пользователь не проходит', () => {
    settings.authEnabled = true
    const res = fakeRes()
    requireUsersAdmin({ authUser: { role: 'user' } }, res, vi.fn())
    expect(res.statusCode).toBe(403)
    expect(res.body.error).toBe('forbidden')
  })
})
