import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import {
  countAdmins,
  countUsers,
  createSession,
  createUser,
  deleteSession,
  deleteUser,
  deleteUserSessions,
  getAppSettings,
  getSessionUser,
  getUserById,
  getUserByInviteToken,
  getUserByLogin,
  listUsers,
  nowIso,
  publicUser,
  saveAppSettings,
  uid,
  updateUser,
} from './db.js'

const scrypt = promisify(scryptCb)
const COOKIE = 'vtbih_session'
const SESSION_DAYS = 14
const INVITE_DAYS = 14

export function isAuthEnabled() {
  return Boolean(getAppSettings().authEnabled)
}

export async function authStatus(req) {
  const enabled = isAuthEnabled()
  const users = await countUsers()
  const user = req.authUser ? publicUser(req.authUser) : null
  return {
    enabled,
    setupRequired: enabled && users === 0,
    user,
  }
}

function parseCookies(req) {
  const header = String(req.headers.cookie || '')
  const out = {}
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq < 0) continue
    const key = part.slice(0, eq).trim()
    const value = part.slice(eq + 1).trim()
    if (!key) continue
    try {
      out[key] = decodeURIComponent(value)
    } catch {
      out[key] = value
    }
  }
  return out
}

function cookieHeader(token, maxAgeSec) {
  const parts = [`${COOKIE}=${token}`, 'HttpOnly', 'Path=/', 'SameSite=Lax']
  if (maxAgeSec <= 0) parts.push('Max-Age=0')
  else parts.push(`Max-Age=${maxAgeSec}`)
  return parts.join('; ')
}

export function setSessionCookie(res, token) {
  res.setHeader('Set-Cookie', cookieHeader(token, SESSION_DAYS * 24 * 60 * 60))
}

export function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', cookieHeader('', 0))
}

export function readSessionId(req) {
  return parseCookies(req)[COOKIE] || ''
}

async function hashPassword(password) {
  const salt = randomBytes(16)
  const key = await scrypt(password, salt, 32)
  return `${salt.toString('hex')}:${Buffer.from(key).toString('hex')}`
}

async function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false
  const [saltHex, hashHex] = stored.split(':')
  const salt = Buffer.from(saltHex, 'hex')
  const actual = Buffer.from(hashHex, 'hex')
  const key = await scrypt(password, salt, 32)
  const given = Buffer.from(key)
  if (actual.length !== given.length) return false
  return timingSafeEqual(actual, given)
}

function normalizeLogin(login) {
  return String(login || '')
    .trim()
    .toLowerCase()
}

function validLogin(login) {
  return /^[a-z0-9._@-]{2,64}$/i.test(login)
}

function validPassword(password) {
  return typeof password === 'string' && password.length >= 8 && password.length <= 128
}

async function issueSession(res, userId) {
  const id = randomBytes(24).toString('hex')
  const createdAt = nowIso()
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString()
  await createSession({ id, userId, createdAt, expiresAt: expires })
  setSessionCookie(res, id)
  return id
}

export async function attachUser(req, _res, next) {
  try {
    req.authUser = await getSessionUser(readSessionId(req))
    next()
  } catch (error) {
    next(error)
  }
}

const PUBLIC_API = [
  /^\/api\/health(?:\/|$)/,
  /^\/api\/auth\/status$/,
  /^\/api\/auth\/login$/,
  /^\/api\/auth\/setup$/,
  /^\/api\/auth\/logout$/,
  /^\/api\/auth\/invite\//,
]

function isPublicApi(req) {
  if (req.method === 'OPTIONS') return true
  const path = req.path || req.url || ''
  return PUBLIC_API.some((re) => re.test(path))
}

export async function enforceAuth(req, res, next) {
  if (!req.path?.startsWith('/api')) return next()
  if (!isAuthEnabled()) return next()
  if (isPublicApi(req)) return next()
  const users = await countUsers()
  if (users === 0) {
    if (req.path === '/api/settings/system' && req.method === 'PUT') return next()
    return res.status(401).json({
      error: 'setup_required',
      message: 'Включили авторизацию — создайте первого администратора',
    })
  }
  if (!req.authUser) {
    return res.status(401).json({ error: 'unauthorized', message: 'Нужен вход' })
  }
  next()
}

export function requireAdmin(req, res, next) {
  if (!isAuthEnabled()) return next()
  if (req.authUser?.role === 'admin') return next()
  return res.status(403).json({ error: 'forbidden', message: 'Нужны права администратора' })
}

export function requireUsersAdmin(req, res, next) {
  if (!isAuthEnabled()) {
    return res.status(403).json({ error: 'auth_off', message: 'Модуль авторизации выключен' })
  }
  return requireAdmin(req, res, next)
}

export async function handleAuthStatus(req, res) {
  res.json(await authStatus(req))
}

export async function handleSetup(req, res) {
  if (!isAuthEnabled()) {
    return res.status(400).json({ error: 'auth_off', message: 'Сначала включите работу по авторизации в настройках' })
  }
  if ((await countUsers()) > 0) {
    return res.status(400).json({ error: 'exists', message: 'Администратор уже создан' })
  }
  const name = String(req.body?.name || '').trim()
  const login = normalizeLogin(req.body?.login)
  const password = String(req.body?.password || '')
  if (!name) return res.status(400).json({ error: 'invalid', message: 'Укажите имя' })
  if (!validLogin(login)) return res.status(400).json({ error: 'invalid', message: 'Логин: латиница, цифры, точка или @, от 2 символов' })
  if (!validPassword(password)) return res.status(400).json({ error: 'invalid', message: 'Пароль не короче 8 символов' })
  const now = nowIso()
  const user = await createUser({
    id: uid('u'),
    login,
    name,
    role: 'admin',
    password_hash: await hashPassword(password),
    created_at: now,
    updated_at: now,
  })
  await issueSession(res, user.id)
  res.status(201).json({ user: publicUser(user), setupRequired: false, enabled: true })
}

export async function handleLogin(req, res) {
  if (!isAuthEnabled()) {
    return res.status(400).json({ error: 'auth_off', message: 'Авторизация выключена' })
  }
  const login = normalizeLogin(req.body?.login)
  const password = String(req.body?.password || '')
  const user = await getUserByLogin(login)
  if (!user?.password_hash || !(await verifyPassword(password, user.password_hash))) {
    return res.status(401).json({ error: 'invalid', message: 'Неверный логин или пароль' })
  }
  await issueSession(res, user.id)
  res.json({ user: publicUser(user) })
}

export async function handleLogout(req, res) {
  await deleteSession(readSessionId(req))
  clearSessionCookie(res)
  res.json({ ok: true })
}

export async function handleInviteInfo(req, res) {
  const user = await getUserByInviteToken(req.params.token)
  if (!user) return res.status(404).json({ error: 'not_found', message: 'Приглашение недействительно или истекло' })
  res.json({ name: user.name, login: user.login })
}

export async function handleAcceptInvite(req, res) {
  const user = await getUserByInviteToken(req.params.token)
  if (!user) return res.status(404).json({ error: 'not_found', message: 'Приглашение недействительно или истекло' })
  const password = String(req.body?.password || '')
  if (!validPassword(password)) return res.status(400).json({ error: 'invalid', message: 'Пароль не короче 8 символов' })
  await updateUser(user.id, {
    password_hash: await hashPassword(password),
    invite_token: null,
    invite_expires: null,
  })
  await issueSession(res, user.id)
  res.json({ user: publicUser(await getUserById(user.id)) })
}

export async function handleSystemGet(_req, res) {
  res.json({
    authEnabled: isAuthEnabled(),
    setupRequired: isAuthEnabled() && (await countUsers()) === 0,
    userCount: await countUsers(),
  })
}

export async function handleSystemPut(req, res) {
  const enabled = Boolean(req.body?.authEnabled)
  if (isAuthEnabled() && req.authUser?.role !== 'admin' && (await countUsers()) > 0) {
    return res.status(403).json({ error: 'forbidden', message: 'Выключить авторизацию может только администратор' })
  }
  const settings = getAppSettings()
  await saveAppSettings({ ...settings, authEnabled: enabled })
  res.json({
    authEnabled: enabled,
    setupRequired: enabled && (await countUsers()) === 0,
    userCount: await countUsers(),
  })
}

export async function handleListUsers(_req, res) {
  res.json(await listUsers())
}

export async function handleCreateUser(req, res) {
  const name = String(req.body?.name || '').trim()
  const login = normalizeLogin(req.body?.login)
  const password = String(req.body?.password || '')
  const role = req.body?.role === 'admin' ? 'admin' : 'user'
  const invite = Boolean(req.body?.invite) || !password
  if (!name) return res.status(400).json({ error: 'invalid', message: 'Укажите имя' })
  if (!validLogin(login)) return res.status(400).json({ error: 'invalid', message: 'Логин: латиница, цифры, точка или @, от 2 символов' })
  if (await getUserByLogin(login)) {
    return res.status(409).json({ error: 'exists', message: 'Такой логин уже есть' })
  }
  if (!invite && !validPassword(password)) {
    return res.status(400).json({ error: 'invalid', message: 'Пароль не короче 8 символов' })
  }
  const now = nowIso()
  const inviteToken = invite ? randomBytes(18).toString('hex') : null
  const inviteExpires = invite ? new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000).toISOString() : null
  const user = await createUser({
    id: uid('u'),
    login,
    name,
    role,
    password_hash: invite ? null : await hashPassword(password),
    invite_token: inviteToken,
    invite_expires: inviteExpires,
    created_at: now,
    updated_at: now,
    created_by: req.authUser?.id,
  })
  res.status(201).json({
    user: publicUser(user),
    inviteToken,
    invitePath: inviteToken ? `/invite/${inviteToken}` : null,
  })
}

export async function handlePatchUser(req, res) {
  const user = await getUserById(req.params.id)
  if (!user) return res.status(404).json({ error: 'not_found', message: 'Пользователь не найден' })
  const patch = {}
  if (typeof req.body?.name === 'string' && req.body.name.trim()) patch.name = req.body.name.trim()
  if (req.body?.role === 'admin' || req.body?.role === 'user') {
    if (user.role === 'admin' && req.body.role === 'user' && (await countAdmins()) <= 1) {
      return res.status(400).json({ error: 'last_admin', message: 'Нельзя снять роль с последнего администратора' })
    }
    patch.role = req.body.role
  }
  if (typeof req.body?.password === 'string' && req.body.password) {
    if (!validPassword(req.body.password)) {
      return res.status(400).json({ error: 'invalid', message: 'Пароль не короче 8 символов' })
    }
    patch.password_hash = await hashPassword(req.body.password)
    patch.invite_token = null
    patch.invite_expires = null
    await deleteUserSessions(user.id)
  }
  const next = await updateUser(user.id, patch)
  res.json({ user: publicUser(next) })
}

export async function handleDeleteUser(req, res) {
  const user = await getUserById(req.params.id)
  if (!user) return res.status(404).json({ error: 'not_found', message: 'Пользователь не найден' })
  if (user.id === req.authUser?.id) {
    return res.status(400).json({ error: 'self', message: 'Нельзя удалить свою учётную запись' })
  }
  if (user.role === 'admin' && (await countAdmins()) <= 1) {
    return res.status(400).json({ error: 'last_admin', message: 'Нельзя удалить последнего администратора' })
  }
  await deleteUser(user.id)
  res.json({ ok: true, id: user.id })
}
