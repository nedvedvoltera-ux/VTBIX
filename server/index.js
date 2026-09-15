import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import cors from 'cors'
import multer from 'multer'
import { config } from './config.js'
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
  saveProject,
  savePrompt,
  uid,
  updateJob,
} from './db.js'
import { pingDocling } from './docling.js'
import { closeJobStream, emitJob, subscribeJob } from './events.js'
import { completeProcessing } from './llm.js'
import { pingLlm } from './qwen.js'
import { abortPipeline, mergeProjectProgress, runDocumentPipeline, runningPipelines } from './pipeline.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = config.port
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

function startPipelineJob({ jobId, project, filePath, fileName, notes, prompt }) {
  abortPipeline(project.id)
  void (async () => {
    let latest = getProject(project.id) || project
    try {
      await runDocumentPipeline({
        project: latest,
        filePath,
        fileName,
        notes,
        prompt,
        onProgress: async (payload) => {
          latest = getProject(project.id) || latest
          const next = saveProject(mergeProjectProgress(latest, payload))
          updateJob(jobId, {
            status: payload.stage === 'done' ? 'done' : 'running',
            stage: payload.stage,
            markdown_path: payload.markdownPath || undefined,
            extracted_json: payload.extracted ? JSON.stringify(payload.extracted) : undefined,
          })
          emitJob(jobId, 'progress', {
            stage: payload.stage,
            progress: next.progress,
            message: payload.message,
            project: next,
          })
          if (payload.stage === 'done') {
            fs.writeFileSync(
              `${filePath}.llm.json`,
              JSON.stringify({ extracted: payload.extracted, jobId, markdownPath: payload.markdownPath }, null, 2),
              'utf8',
            )
            finishJob(jobId, {
              status: 'done',
              extracted_json: JSON.stringify(payload.extracted ?? {}),
              response_json: JSON.stringify({
                provider: config.llmApiUrl ? 'qwen' : 'heuristic',
                model: config.llmModel,
                markdownPath: payload.markdownPath,
              }),
              error: null,
              finished_at: nowIso(),
            })
            emitJob(jobId, 'done', { project: next, extracted: payload.extracted })
            closeJobStream(jobId)
          }
        },
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const failed = saveProject({
        ...(getProject(project.id) || latest),
        status: 'error',
        pipelineStage: 'error',
        pipelineMessage: message,
        updatedAt: nowIso(),
      })
      finishJob(jobId, {
        status: 'error',
        extracted_json: null,
        response_json: null,
        error: message,
        finished_at: nowIso(),
      })
      updateJob(jobId, { stage: 'error' })
      emitJob(jobId, 'failed', { message, project: failed })
      closeJobStream(jobId)
    }
  })()
}

app.get('/api/health', async (_req, res) => {
  const [docling, llm] = await Promise.all([pingDocling(), pingLlm()])
  res.json({
    ok: true,
    service: 'vtbih-api',
    dataDir: DATA_DIR,
    pipeline: {
      docling,
      llm,
      model: config.llmModel,
    },
  })
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
  upload.single('file')(req, res, (err) => {
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

    const notes = req.body.notes || project.notes || ''
    const prompt = getPrompt()
    const jobId = uid('job')
    const next = saveProject({
      ...project,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      notes,
      status: 'processing',
      progress: 5,
      pipelineStage: 'converting',
      pipelineMessage: 'Файл принят. Docling готовит Markdown…',
      updatedAt: nowIso(),
    })

    insertJob({
      id: jobId,
      project_id: next.id,
      status: 'running',
      file_name: req.file.originalname,
      file_path: req.file.path,
      file_size: req.file.size,
      notes,
      prompt_snapshot: prompt ? JSON.stringify(prompt) : null,
      extracted_json: null,
      response_json: null,
      error: null,
      created_at: nowIso(),
      finished_at: null,
    })
    updateJob(jobId, { stage: 'converting' })

    startPipelineJob({
      jobId,
      project: next,
      filePath: req.file.path,
      fileName: req.file.originalname,
      notes,
      prompt,
    })

    res.json({ project: next, job: getJob(jobId) })
  })
})

app.post('/api/projects/:id/analyze', (req, res) => {
  const project = getProject(req.params.id)
  if (!project) return res.status(404).json({ error: 'not_found' })
  const jobs = listJobs(project.id)
  const source = jobs.find((item) => item.filePath && fs.existsSync(item.filePath))
  if (!source) return res.status(400).json({ error: 'file_required', message: 'Сначала загрузите файл проекта.' })

  const notes = req.body?.notes || project.notes || source.notes || ''
  const prompt = getPrompt()
  const jobId = uid('job')
  const next = saveProject({
    ...project,
    notes,
    status: 'processing',
    progress: 5,
    pipelineStage: 'converting',
    pipelineMessage: 'Повторный разбор: Docling → Qwen…',
    updatedAt: nowIso(),
  })
  insertJob({
    id: jobId,
    project_id: next.id,
    status: 'running',
    file_name: source.fileName,
    file_path: source.filePath,
    file_size: source.fileSize,
    notes,
    prompt_snapshot: prompt ? JSON.stringify(prompt) : null,
    extracted_json: null,
    response_json: null,
    error: null,
    created_at: nowIso(),
    finished_at: null,
  })
  updateJob(jobId, { stage: 'converting' })
  startPipelineJob({
    jobId,
    project: next,
    filePath: source.filePath,
    fileName: source.fileName,
    notes,
    prompt,
  })
  res.json({ project: next, job: getJob(jobId) })
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

app.get('/api/jobs/:id/stream', (req, res) => {
  const job = getJob(req.params.id)
  if (!job) return res.status(404).json({ error: 'not_found' })
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  if (typeof res.flushHeaders === 'function') res.flushHeaders()
  res.write(`event: snapshot\ndata: ${JSON.stringify({ job, project: getProject(job.projectId) })}\n\n`)
  subscribeJob(job.id, res)
  if (job.status === 'done' || job.status === 'error') {
    emitJob(job.id, job.status === 'done' ? 'done' : 'failed', {
      project: getProject(job.projectId),
      extracted: job.extracted,
      message: job.error,
    })
    closeJobStream(job.id)
  }
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
    if (runningPipelines.has(project.id) || project.pipelineStage === 'converting' || project.pipelineStage === 'extracting') {
      continue
    }
    const nextProgress = Math.min(100, (project.progress || 0) + Math.round(6 + Math.random() * 10))
    if (nextProgress >= 100) {
      saveProject(completeProcessing(project, getPrompt()))
    } else {
      saveProject({ ...project, progress: nextProgress, updatedAt: nowIso() })
    }
  }
}, 2000)

app.listen(PORT, () => {
  console.log(`VTBIH API http://localhost:${PORT}`)
  console.log(`Docling ${config.doclingUrl || 'не задан'} · Qwen ${config.llmApiUrl || 'не задан'} · ${config.llmModel}`)
})
