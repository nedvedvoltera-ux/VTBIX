import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { hydrateProjectDocuments } from './documents.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data')
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads')
const DB_PATH = path.join(DATA_DIR, 'vtbih.db')

fs.mkdirSync(UPLOAD_DIR, { recursive: true })

export const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS prompt_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    payload TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS llm_jobs (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    status TEXT NOT NULL,
    file_name TEXT,
    file_path TEXT,
    file_size INTEGER,
    notes TEXT,
    prompt_snapshot TEXT,
    extracted_json TEXT,
    response_json TEXT,
    error TEXT,
    created_at TEXT NOT NULL,
    finished_at TEXT,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_jobs_project ON llm_jobs(project_id);
  CREATE INDEX IF NOT EXISTS idx_jobs_status ON llm_jobs(status);
`)

function ensureColumn(table, column, type) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all()
  if (!cols.some((col) => col.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`)
  }
}

ensureColumn('llm_jobs', 'markdown_path', 'TEXT')
ensureColumn('llm_jobs', 'stage', 'TEXT')

export function nowIso() {
  return new Date().toISOString()
}

export function uid(prefix = 'id') {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`
}

export function getProject(id) {
  const row = db.prepare('SELECT payload FROM projects WHERE id = ?').get(id)
  return row ? hydrateProjectDocuments(JSON.parse(row.payload)) : null
}

export function listProjects() {
  return db
    .prepare('SELECT payload FROM projects ORDER BY updated_at DESC')
    .all()
    .map((row) => hydrateProjectDocuments(JSON.parse(row.payload)))
}

export function saveProject(project) {
  const updatedAt = project.updatedAt || nowIso()
  const payload = JSON.stringify({ ...project, updatedAt })
  db.prepare(
    `INSERT INTO projects (id, payload, created_at, updated_at)
     VALUES (@id, @payload, @created_at, @updated_at)
     ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`,
  ).run({
    id: project.id,
    payload,
    created_at: project.createdAt || updatedAt,
    updated_at: updatedAt,
  })
  return hydrateProjectDocuments(JSON.parse(payload))
}

export function deleteProject(id) {
  const existed = Boolean(db.prepare('SELECT id FROM projects WHERE id = ?').get(id))
  db.prepare('DELETE FROM llm_jobs WHERE project_id = ?').run(id)
  db.prepare('DELETE FROM projects WHERE id = ?').run(id)
  try {
    fs.rmSync(path.join(UPLOAD_DIR, id), { recursive: true, force: true })
  } catch {
    // folder may be absent
  }
  return existed
}

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

export function purgeSeedProjects() {
  const delJobs = db.prepare('DELETE FROM llm_jobs WHERE project_id = ?')
  const delProject = db.prepare('DELETE FROM projects WHERE id = ?')
  const run = db.transaction((ids) => {
    let removed = 0
    for (const id of ids) {
      delJobs.run(id)
      removed += delProject.run(id).changes
    }
    return removed
  })
  return run(SEED_PROJECT_IDS)
}

const removedSeeds = purgeSeedProjects()
if (removedSeeds) console.log(`[db] removed ${removedSeeds} mock seed projects`)

export function patchProject(id, patch) {
  const current = getProject(id)
  if (!current) return null
  return saveProject({ ...current, ...patch, id, updatedAt: nowIso() })
}

export function getPrompt() {
  const row = db.prepare('SELECT payload FROM prompt_config WHERE id = 1').get()
  return row ? JSON.parse(row.payload) : null
}

export function savePrompt(prompt) {
  const updatedAt = nowIso()
  db.prepare(
    `INSERT INTO prompt_config (id, payload, updated_at)
     VALUES (1, @payload, @updated_at)
     ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`,
  ).run({ payload: JSON.stringify(prompt), updated_at: updatedAt })
  return prompt
}

export function insertJob(job) {
  db.prepare(
    `INSERT INTO llm_jobs (
      id, project_id, status, file_name, file_path, file_size, notes,
      prompt_snapshot, extracted_json, response_json, error, created_at, finished_at
    ) VALUES (
      @id, @project_id, @status, @file_name, @file_path, @file_size, @notes,
      @prompt_snapshot, @extracted_json, @response_json, @error, @created_at, @finished_at
    )`,
  ).run(job)
  return job
}

export function finishJob(id, fields) {
  db.prepare(
    `UPDATE llm_jobs
     SET status = @status, extracted_json = @extracted_json, response_json = @response_json,
         error = @error, finished_at = @finished_at
     WHERE id = @id`,
  ).run({ id, ...fields })
}

export function updateJob(id, fields) {
  const allowed = ['status', 'extracted_json', 'response_json', 'error', 'finished_at', 'markdown_path', 'stage']
  const sets = []
  const payload = { id }
  for (const key of allowed) {
    if (fields[key] === undefined) continue
    sets.push(`${key} = @${key}`)
    payload[key] = fields[key]
  }
  if (!sets.length) return
  db.prepare(`UPDATE llm_jobs SET ${sets.join(', ')} WHERE id = @id`).run(payload)
}

export function listJobs(projectId) {
  const sql = projectId
    ? db.prepare('SELECT * FROM llm_jobs WHERE project_id = ? ORDER BY created_at DESC')
    : db.prepare('SELECT * FROM llm_jobs ORDER BY created_at DESC LIMIT 100')
  const rows = projectId ? sql.all(projectId) : sql.all()
  return rows.map(serializeJob)
}

export function getJob(id) {
  const row = db.prepare('SELECT * FROM llm_jobs WHERE id = ?').get(id)
  return row ? serializeJob(row) : null
}

function serializeJob(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    status: row.status,
    fileName: row.file_name,
    filePath: row.file_path,
    fileSize: row.file_size,
    notes: row.notes,
    promptSnapshot: row.prompt_snapshot ? JSON.parse(row.prompt_snapshot) : null,
    extracted: row.extracted_json ? JSON.parse(row.extracted_json) : null,
    response: row.response_json ? JSON.parse(row.response_json) : null,
    error: row.error,
    createdAt: row.created_at,
    finishedAt: row.finished_at,
    markdownPath: row.markdown_path || null,
    stage: row.stage || row.status,
  }
}
