import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { hydrateProjectDocuments } from './documents.js'

const { Pool } = pg

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data')
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads')

fs.mkdirSync(UPLOAD_DIR, { recursive: true })

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
  );

  CREATE TABLE IF NOT EXISTS prompt_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    payload JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
  );

  CREATE TABLE IF NOT EXISTS llm_jobs (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    status TEXT NOT NULL,
    file_name TEXT,
    file_path TEXT,
    file_size BIGINT,
    notes TEXT,
    prompt_snapshot JSONB,
    extracted_json JSONB,
    response_json JSONB,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    finished_at TIMESTAMPTZ,
    markdown_path TEXT,
    stage TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_jobs_project ON llm_jobs(project_id);
  CREATE INDEX IF NOT EXISTS idx_jobs_status ON llm_jobs(status);
  CREATE INDEX IF NOT EXISTS idx_projects_updated ON projects(updated_at DESC);

  CREATE TABLE IF NOT EXISTS app_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    payload JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    login TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'admin')),
    password_hash TEXT,
    invite_token TEXT UNIQUE,
    invite_expires TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    created_by TEXT
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

  CREATE TABLE IF NOT EXISTS media_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    payload JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
  );

  CREATE TABLE IF NOT EXISTS media_hits (
    id TEXT PRIMARY KEY,
    url TEXT NOT NULL UNIQUE,
    payload JSONB NOT NULL,
    found_at TIMESTAMPTZ NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_media_hits_found ON media_hits(found_at DESC);

  CREATE TABLE IF NOT EXISTS media_jobs (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    stage TEXT,
    error TEXT,
    stats JSONB,
    created_at TIMESTAMPTZ NOT NULL,
    finished_at TIMESTAMPTZ
  );

  CREATE TABLE IF NOT EXISTS crm_deals (
    id TEXT PRIMARY KEY,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_crm_deals_updated ON crm_deals(updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_crm_deals_project ON crm_deals ((payload->>'projectId'));
  CREATE INDEX IF NOT EXISTS idx_crm_deals_infovod ON crm_deals ((payload->>'infovodId'));
`

const SEED_PROJECT_IDS = [
  'p-tec5',
  'p-vostok',
  'p-chernozem',
  'p-north-dc',
  'p-pharma-kzn',
  'p-gok',
  'p-astana-hub',
  'p-minsk-plant',
  'p-smoke',
]

/** @type {pg.Pool | null} */
let pool = null
let appSettingsCache = {}

function databaseUrl() {
  return process.env.DATABASE_URL || ''
}

function asJson(value, fallback) {
  if (value == null || value === '') return fallback
  if (typeof value === 'object') return value
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function query(text, params = []) {
  if (!pool) throw new Error('База ещё не подключена')
  return pool.query(text, params)
}

async function one(text, params = []) {
  const result = await query(text, params)
  return result.rows[0] || null
}

export function nowIso() {
  return new Date().toISOString()
}

export function uid(prefix = 'id') {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`
}

export async function pingDb() {
  try {
    if (!pool) return { ok: false, error: 'нет подключения' }
    await pool.query('SELECT 1')
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export async function initDb() {
  const url = databaseUrl()
  if (!url) {
    throw new Error('DATABASE_URL не задан. Для Docker он прописывается в compose, локально — в .env')
  }
  pool = new Pool({
    connectionString: url,
    max: 10,
    idleTimeoutMillis: 30_000,
  })
  let lastError = null
  for (let attempt = 1; attempt <= 40; attempt += 1) {
    try {
      await pool.query('SELECT 1')
      lastError = null
      break
    } catch (error) {
      lastError = error
      console.warn(`[db] PostgreSQL ещё не готов (${attempt}/40)`)
      await sleep(1000)
    }
  }
  if (lastError) {
    throw new Error(`Не удалось подключиться к PostgreSQL: ${lastError.message}`)
  }
  await pool.query(SCHEMA)
  const settingsRow = await one('SELECT payload FROM app_settings WHERE id = 1')
  appSettingsCache = asJson(settingsRow?.payload, {}) || {}
  const removed = await purgeSeedProjects()
  if (removed) console.log(`[db] removed ${removed} mock seed projects`)
  console.log('[db] PostgreSQL готов')
}

export async function getProject(id) {
  const row = await one('SELECT payload FROM projects WHERE id = $1', [id])
  const payload = asJson(row?.payload, null)
  return payload ? hydrateProjectDocuments(payload) : null
}

export async function listProjects() {
  const result = await query('SELECT payload FROM projects ORDER BY updated_at DESC')
  return result.rows.map((row) => hydrateProjectDocuments(asJson(row.payload, {})))
}

export async function saveProject(project) {
  const updatedAt = project.updatedAt || nowIso()
  const payload = { ...project, updatedAt }
  await query(
    `INSERT INTO projects (id, payload, created_at, updated_at)
     VALUES ($1, $2::jsonb, $3, $4)
     ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = EXCLUDED.updated_at`,
    [project.id, JSON.stringify(payload), project.createdAt || updatedAt, updatedAt],
  )
  return hydrateProjectDocuments(payload)
}

export async function deleteProject(id) {
  const existed = Boolean(await one('SELECT id FROM projects WHERE id = $1', [id]))
  await query('DELETE FROM llm_jobs WHERE project_id = $1', [id])
  await query('DELETE FROM projects WHERE id = $1', [id])
  try {
    fs.rmSync(path.join(UPLOAD_DIR, id), { recursive: true, force: true })
  } catch {
    // folder may be absent
  }
  return existed
}

export async function purgeSeedProjects() {
  const result = await query('DELETE FROM projects WHERE id = ANY($1::text[])', [SEED_PROJECT_IDS])
  return result.rowCount || 0
}

export async function patchProject(id, patch) {
  const current = await getProject(id)
  if (!current) return null
  return saveProject({ ...current, ...patch, id, updatedAt: nowIso() })
}

export async function getPrompt() {
  const row = await one('SELECT payload FROM prompt_config WHERE id = 1')
  return asJson(row?.payload, null)
}

export async function savePrompt(prompt) {
  const updatedAt = nowIso()
  await query(
    `INSERT INTO prompt_config (id, payload, updated_at)
     VALUES (1, $1::jsonb, $2)
     ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = EXCLUDED.updated_at`,
    [JSON.stringify(prompt), updatedAt],
  )
  return prompt
}

export function getAppSettings() {
  return appSettingsCache && typeof appSettingsCache === 'object' ? appSettingsCache : {}
}

export async function saveAppSettings(payload) {
  const updatedAt = nowIso()
  const next = payload && typeof payload === 'object' ? payload : {}
  await query(
    `INSERT INTO app_settings (id, payload, updated_at)
     VALUES (1, $1::jsonb, $2)
     ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = EXCLUDED.updated_at`,
    [JSON.stringify(next), updatedAt],
  )
  appSettingsCache = next
  return next
}

function toJsonParam(value) {
  if (value == null || value === '') return null
  if (typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch {
      return value
    }
  }
  return value
}

export async function insertJob(job) {
  await query(
    `INSERT INTO llm_jobs (
      id, project_id, status, file_name, file_path, file_size, notes,
      prompt_snapshot, extracted_json, response_json, error, created_at, finished_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb,$11,$12,$13)`,
    [
      job.id,
      job.project_id,
      job.status,
      job.file_name,
      job.file_path,
      job.file_size,
      job.notes,
      toJsonParam(job.prompt_snapshot),
      toJsonParam(job.extracted_json),
      toJsonParam(job.response_json),
      job.error,
      job.created_at,
      job.finished_at,
    ],
  )
  return job
}

export async function finishJob(id, fields) {
  await query(
    `UPDATE llm_jobs
     SET status = $2, extracted_json = $3::jsonb, response_json = $4::jsonb,
         error = $5, finished_at = $6
     WHERE id = $1`,
    [
      id,
      fields.status,
      toJsonParam(fields.extracted_json),
      toJsonParam(fields.response_json),
      fields.error,
      fields.finished_at,
    ],
  )
}

export async function updateJob(id, fields) {
  const allowed = ['status', 'extracted_json', 'response_json', 'error', 'finished_at', 'markdown_path', 'stage']
  const sets = []
  const params = []
  for (const key of allowed) {
    if (fields[key] === undefined) continue
    params.push(key.endsWith('_json') || key === 'extracted_json' || key === 'response_json' ? toJsonParam(fields[key]) : fields[key])
    const cast = key.endsWith('_json') ? '::jsonb' : ''
    sets.push(`${key} = $${params.length}${cast}`)
  }
  if (!sets.length) return
  params.push(id)
  await query(`UPDATE llm_jobs SET ${sets.join(', ')} WHERE id = $${params.length}`, params)
}

export async function listJobs(projectId) {
  const result = projectId
    ? await query('SELECT * FROM llm_jobs WHERE project_id = $1 ORDER BY created_at DESC', [projectId])
    : await query('SELECT * FROM llm_jobs ORDER BY created_at DESC LIMIT 100')
  return result.rows.map(serializeJob)
}

export async function getJob(id) {
  const row = await one('SELECT * FROM llm_jobs WHERE id = $1', [id])
  return row ? serializeJob(row) : null
}

function serializeJob(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    status: row.status,
    fileName: row.file_name,
    filePath: row.file_path,
    fileSize: row.file_size == null ? null : Number(row.file_size),
    notes: row.notes,
    promptSnapshot: asJson(row.prompt_snapshot, null),
    extracted: asJson(row.extracted_json, null),
    response: asJson(row.response_json, null),
    error: row.error,
    createdAt: row.created_at,
    finishedAt: row.finished_at,
    markdownPath: row.markdown_path || null,
    stage: row.stage || row.status,
  }
}

export function publicUser(row) {
  if (!row) return null
  return {
    id: row.id,
    login: row.login,
    name: row.name,
    role: row.role,
    pendingInvite: Boolean(row.invite_token) && !row.password_hash,
    createdAt: row.created_at,
  }
}

export async function countUsers() {
  const row = await one('SELECT COUNT(*)::int AS count FROM users')
  return row?.count || 0
}

export async function countAdmins() {
  const row = await one("SELECT COUNT(*)::int AS count FROM users WHERE role = 'admin'")
  return row?.count || 0
}

export async function listUsers() {
  const result = await query('SELECT * FROM users ORDER BY created_at ASC')
  return result.rows.map(publicUser)
}

export async function getUserById(id) {
  return one('SELECT * FROM users WHERE id = $1', [id])
}

export async function getUserByLogin(login) {
  return one('SELECT * FROM users WHERE LOWER(login) = LOWER($1)', [login])
}

export async function getUserByInviteToken(token) {
  return one(
    'SELECT * FROM users WHERE invite_token = $1 AND (invite_expires IS NULL OR invite_expires > NOW())',
    [token],
  )
}

export async function createUser(user) {
  await query(
    `INSERT INTO users (id, login, name, role, password_hash, invite_token, invite_expires, created_at, updated_at, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      user.id,
      user.login,
      user.name,
      user.role,
      user.password_hash || null,
      user.invite_token || null,
      user.invite_expires || null,
      user.created_at,
      user.updated_at,
      user.created_by || null,
    ],
  )
  return getUserById(user.id)
}

export async function updateUser(id, fields) {
  const allowed = ['name', 'role', 'password_hash', 'invite_token', 'invite_expires', 'login']
  const sets = []
  const params = []
  for (const key of allowed) {
    if (fields[key] === undefined) continue
    params.push(fields[key])
    sets.push(`${key} = $${params.length}`)
  }
  if (!sets.length) return getUserById(id)
  params.push(nowIso())
  sets.push(`updated_at = $${params.length}`)
  params.push(id)
  await query(`UPDATE users SET ${sets.join(', ')} WHERE id = $${params.length}`, params)
  return getUserById(id)
}

export async function deleteUser(id) {
  const result = await query('DELETE FROM users WHERE id = $1', [id])
  return (result.rowCount || 0) > 0
}

export async function createSession({ id, userId, createdAt, expiresAt }) {
  await query(
    `INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES ($1,$2,$3,$4)`,
    [id, userId, createdAt, expiresAt],
  )
}

export async function getSessionUser(sessionId) {
  if (!sessionId) return null
  await query('DELETE FROM sessions WHERE expires_at < NOW()')
  const row = await one(
    `SELECT u.* FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.id = $1 AND s.expires_at > NOW()`,
    [sessionId],
  )
  return row
}

export async function deleteSession(sessionId) {
  if (!sessionId) return
  await query('DELETE FROM sessions WHERE id = $1', [sessionId])
}

export async function deleteUserSessions(userId) {
  await query('DELETE FROM sessions WHERE user_id = $1', [userId])
}

export async function getMediaConfig() {
  const row = await one('SELECT payload FROM media_config WHERE id = 1')
  return asJson(row?.payload, null)
}

export async function saveMediaConfig(payload) {
  const updatedAt = nowIso()
  await query(
    `INSERT INTO media_config (id, payload, updated_at)
     VALUES (1, $1::jsonb, $2)
     ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = EXCLUDED.updated_at`,
    [JSON.stringify(payload), updatedAt],
  )
  return payload
}

function serializeMediaHit(row) {
  const payload = asJson(row.payload, {})
  return {
    ...payload,
    id: row.id,
    url: row.url || payload.url,
    foundAt: row.found_at,
  }
}

export async function listMediaHits() {
  const result = await query('SELECT * FROM media_hits ORDER BY found_at DESC LIMIT 300')
  return result.rows.map(serializeMediaHit)
}

export async function getMediaHit(id) {
  const row = await one('SELECT * FROM media_hits WHERE id = $1', [id])
  return row ? serializeMediaHit(row) : null
}

export async function upsertMediaHit(hit) {
  const existing = await one('SELECT * FROM media_hits WHERE url = $1', [hit.url])
  const prev = existing ? asJson(existing.payload, {}) : {}
  const id = existing?.id || hit.id || uid('m')
  const foundAt = existing ? existing.found_at : hit.foundAt || nowIso()
  const merged = {
    ...prev,
    ...hit,
    id,
    foundAt,
    updatedAt: nowIso(),
    decision: prev.decision && prev.decision !== 'new' ? prev.decision : hit.decision || prev.decision || 'new',
    notes: hit.notes !== undefined ? hit.notes : prev.notes || '',
    projectId: prev.projectId || hit.projectId || null,
  }
  await query(
    `INSERT INTO media_hits (id, url, payload, found_at)
     VALUES ($1, $2, $3::jsonb, $4)
     ON CONFLICT (url) DO UPDATE SET payload = EXCLUDED.payload, found_at = media_hits.found_at`,
    [id, merged.url, JSON.stringify(merged), foundAt],
  )
  return getMediaHit(id)
}

export async function patchMediaHit(id, patch) {
  const current = await getMediaHit(id)
  if (!current) return null
  const next = { ...current, ...patch, id, url: current.url, updatedAt: nowIso() }
  await query('UPDATE media_hits SET payload = $2::jsonb WHERE id = $1', [id, JSON.stringify(next)])
  return getMediaHit(id)
}

export async function deleteMediaHit(id) {
  const result = await query('DELETE FROM media_hits WHERE id = $1', [id])
  return (result.rowCount || 0) > 0
}

export async function clearMediaHits() {
  await query('DELETE FROM media_hits')
}

function serializeMediaJob(row) {
  if (!row) return null
  return {
    id: row.id,
    status: row.status,
    stage: row.stage || row.status,
    error: row.error || null,
    stats: asJson(row.stats, null),
    createdAt: row.created_at,
    finishedAt: row.finished_at,
  }
}

export async function insertMediaJob(job) {
  await query(
    `INSERT INTO media_jobs (id, status, stage, error, stats, created_at, finished_at)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7)`,
    [job.id, job.status, job.stage || job.status, job.error || null, toJsonParam(job.stats), job.created_at, job.finished_at || null],
  )
  return job
}

export async function updateMediaJob(id, fields) {
  const allowed = ['status', 'stage', 'error', 'stats', 'finished_at']
  const sets = []
  const params = []
  for (const key of allowed) {
    if (fields[key] === undefined) continue
    params.push(key === 'stats' ? toJsonParam(fields[key]) : fields[key])
    const cast = key === 'stats' ? '::jsonb' : ''
    sets.push(`${key} = $${params.length}${cast}`)
  }
  if (!sets.length) return getMediaJob(id)
  params.push(id)
  await query(`UPDATE media_jobs SET ${sets.join(', ')} WHERE id = $${params.length}`, params)
  return getMediaJob(id)
}

export async function getMediaJob(id) {
  return serializeMediaJob(await one('SELECT * FROM media_jobs WHERE id = $1', [id]))
}

export async function latestMediaJob() {
  return serializeMediaJob(await one('SELECT * FROM media_jobs ORDER BY created_at DESC LIMIT 1'))
}

function serializeDeal(row) {
  if (!row) return null
  const payload = asJson(row.payload, {})
  return {
    ...payload,
    id: row.id,
    createdAt: payload.createdAt || row.created_at,
    updatedAt: payload.updatedAt || row.updated_at,
  }
}

export async function listCrmDeals() {
  const result = await query('SELECT * FROM crm_deals ORDER BY updated_at DESC')
  return result.rows.map(serializeDeal)
}

export async function getCrmDeal(id) {
  return serializeDeal(await one('SELECT * FROM crm_deals WHERE id = $1', [id]))
}

export async function saveCrmDeal(deal) {
  const updatedAt = deal.updatedAt || nowIso()
  const payload = { ...deal, updatedAt }
  await query(
    `INSERT INTO crm_deals (id, payload, created_at, updated_at)
     VALUES ($1, $2::jsonb, $3, $4)
     ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = EXCLUDED.updated_at`,
    [deal.id, JSON.stringify(payload), deal.createdAt || updatedAt, updatedAt],
  )
  return getCrmDeal(deal.id)
}

export async function deleteCrmDeal(id) {
  const result = await query('DELETE FROM crm_deals WHERE id = $1', [id])
  return (result.rowCount || 0) > 0
}
