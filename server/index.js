import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import cors from 'cors'
import multer from 'multer'
import {
  DATA_DIR,
  UPLOAD_DIR,
  finishJob,
  getJob,
  getProject,
  getPrompt,
  insertJob,
  listJobs,
  listProjects,
  nowIso,
  patchProject,
  saveProject,
  savePrompt,
  uid,
} from './db.js'
import { completeProcessing, runLlmExtraction } from './llm.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PORT || 8080)
const app = express()

app.use(cors())
app.use(express.json({ limit: '8mb' }))

const storage = multer.diskStorage({
  destination(req, _file, cb) {
    const dir = path.join(UPLOAD_DIR, req.params.id || 'misc')
    fs.mkdirSync(dir, { recursive: true })
    cb(null, dir)
  },
  filename(_req, file, cb) {
    const safe = file.originalname.replace(/[^\w.\-а-яА-ЯёЁ]+/g, '_')
    cb(null, `${Date.now()}-${safe}`)
  },
})

const upload = multer({
  storage,
  limits: { fileSize: 40 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const ok = /\.(xlsx|xls|xlsm|pdf|docx|doc|csv)$/i.test(file.originalname)
    cb(ok ? null : new Error('Нужен файл модели или ТЭО: xlsx, pdf, docx, csv.'), ok)
  },
})

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'vtbih-api', dataDir: DATA_DIR })
})

app.get('/api/projects', (_req, res) => {
  res.json(listProjects())
})

app.get('/api/projects/:id', (req, res) => {
  const project = getProject(req.params.id)
  if (!project) return res.status(404).json({ error: 'not_found' })
  res.json(project)
})

app.put('/api/projects/:id', (req, res) => {
  const project = saveProject({ ...req.body, id: req.params.id })
  res.json(project)
})

app.post('/api/projects', (req, res) => {
  const id = req.body?.id || uid('p')
  const now = nowIso()
  const project = saveProject({
    status: 'draft',
    progress: 0,
    extractedByLlm: false,
    notes: '',
    owner: 'Вы',
    createdAt: now,
    ...req.body,
    id,
    updatedAt: now,
  })
  res.status(201).json(project)
})

app.post('/api/projects/:id/file', (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message })
    if (!req.file) return res.status(400).json({ error: 'file_required' })

    let project = getProject(req.params.id)
    if (!project) {
      const now = nowIso()
      project = saveProject({
        id: req.params.id,
        name: '',
        fileName: req.file.originalname,
        fileSize: req.file.size,
        notes: req.body.notes || '',
        industry: '',
        country: '',
        region: '',
        budget: null,
        status: 'draft',
        progress: 0,
        createdAt: now,
        updatedAt: now,
        extractedByLlm: false,
        owner: 'Вы',
      })
    }

    const jobId = uid('job')
    const prompt = getPrompt()
    insertJob({
      id: jobId,
      project_id: project.id,
      status: 'running',
      file_name: req.file.originalname,
      file_path: req.file.path,
      file_size: req.file.size,
      notes: req.body.notes || project.notes || '',
      prompt_snapshot: prompt ? JSON.stringify(prompt) : null,
      extracted_json: null,
      response_json: null,
      error: null,
      created_at: nowIso(),
      finished_at: null,
    })

    try {
      const llm = await runLlmExtraction({
        fileName: req.file.originalname,
        notes: req.body.notes || project.notes || '',
        prompt,
        filePath: req.file.path,
      })
      const extracted = llm.extracted || llm
      const next = saveProject({
        ...project,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        name: project.name?.trim() ? project.name : extracted.name,
        industry: extracted.industry,
        country: extracted.country,
        region: extracted.region,
        budget: extracted.budget,
        extractedByLlm: true,
        updatedAt: nowIso(),
      })
      const artifactPath = `${req.file.path}.llm.json`
      fs.writeFileSync(artifactPath, JSON.stringify({ extracted, llm, jobId }, null, 2), 'utf8')
      finishJob(jobId, {
        status: 'done',
        extracted_json: JSON.stringify(extracted),
        response_json: JSON.stringify(llm),
        error: null,
        finished_at: nowIso(),
      })
      res.json({ project: next, job: getJob(jobId), extracted })
    } catch (error) {
      finishJob(jobId, {
        status: 'error',
        extracted_json: null,
        response_json: null,
        error: error instanceof Error ? error.message : String(error),
        finished_at: nowIso(),
      })
      res.status(502).json({ error: 'llm_failed', message: error instanceof Error ? error.message : String(error) })
    }
  })
})

app.get('/api/projects/:id/jobs', (req, res) => {
  res.json(listJobs(req.params.id))
})

app.get('/api/jobs', (_req, res) => {
  res.json(listJobs())
})

app.get('/api/jobs/:id', (req, res) => {
  const job = getJob(req.params.id)
  if (!job) return res.status(404).json({ error: 'not_found' })
  res.json(job)
})

app.get('/api/prompt', (_req, res) => {
  res.json(getPrompt())
})

app.put('/api/prompt', (req, res) => {
  res.json(savePrompt(req.body))
})

const distDir = path.join(__dirname, '..', 'dist')
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir))
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next()
    if (req.path.startsWith('/api')) return next()
    res.sendFile(path.join(distDir, 'index.html'))
  })
}

setInterval(() => {
  for (const project of listProjects()) {
    if (project.status !== 'processing') continue
    const nextProgress = Math.min(100, (project.progress || 0) + Math.round(6 + Math.random() * 10))
    if (nextProgress >= 100) {
      saveProject(completeProcessing(project))
    } else {
      saveProject({ ...project, progress: nextProgress, updatedAt: nowIso() })
    }
  }
}, 2000)

app.listen(PORT, () => {
  console.log(`VTBIH API http://localhost:${PORT}`)
})
