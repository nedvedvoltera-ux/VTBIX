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
  deleteProject,
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
import { combineDocumentsMarkdown, decodeOriginalName, readDocumentMarkdown, summarizeDocuments } from './documents.js'
import { closeJobStream, emitJob, subscribeJob } from './events.js'
import { abortPipeline, mergeProjectProgress, runConvertDocuments, runExtractDocuments } from './pipeline.js'
import { getLastLlmProbe, pingLlm, probeLlm } from './qwen.js'

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
    const ok = /\.(xlsx|xls|xlsm|pdf|docx|doc|csv|md|txt)$/i.test(file.originalname)
    cb(ok ? null : new Error('Нужен файл модели или ТЭО: xlsx, pdf, docx, csv, md.'), ok)
  },
})

function withJobPaths(project) {
  const jobs = listJobs(project.id)
  let documents = Array.isArray(project.documents) ? [...project.documents] : []
  documents = documents.map((doc) => {
    if (doc.filePath && fs.existsSync(doc.filePath)) {
      const mdPath = doc.markdownPath || `${doc.filePath}.md`
      return {
        ...doc,
        markdownPath: fs.existsSync(mdPath) ? mdPath : doc.markdownPath,
        markdownReady: doc.markdownReady || fs.existsSync(mdPath),
      }
    }
    const match =
      jobs.find((job) => job.filePath && fs.existsSync(job.filePath) && job.fileName === doc.fileName) ||
      jobs.find((job) => job.markdownPath && fs.existsSync(job.markdownPath) && job.fileName === doc.fileName)
    if (!match) return doc
    return {
      ...doc,
      filePath: doc.filePath || match.filePath,
      markdownPath: doc.markdownPath || match.markdownPath,
      markdownReady: doc.markdownReady || Boolean(match.markdownPath && fs.existsSync(match.markdownPath)),
    }
  })
  if (!documents.length) {
    const seen = new Set()
    for (const job of jobs) {
      if (!job.filePath || seen.has(job.filePath) || !fs.existsSync(job.filePath)) continue
      seen.add(job.filePath)
      const mdPath = job.markdownPath && fs.existsSync(job.markdownPath) ? job.markdownPath : `${job.filePath}.md`
      documents.push({
        id: uid('doc'),
        fileName: job.fileName || path.basename(job.filePath),
        fileSize: job.fileSize || 0,
        filePath: job.filePath,
        markdownPath: fs.existsSync(mdPath) ? mdPath : job.markdownPath,
        markdownReady: fs.existsSync(mdPath),
        status: fs.existsSync(mdPath) ? 'ready' : 'converting',
      })
    }
  }
  return { ...project, documents, ...summarizeDocuments(documents) }
}

const jobChain = new Map()

function startPipelineJob({ jobId, project, mode, documents, notes, prompt }) {
  const prev = jobChain.get(project.id) || Promise.resolve()
  const run = prev.catch(() => {}).then(
    () =>
      new Promise((resolve) => {
        void (async () => {
          let latest = getProject(project.id) || project
          try {
            const onProgress = async (payload) => {
              latest = getProject(project.id) || latest
              const next = saveProject(mergeProjectProgress(latest, payload, getPrompt()))
              latest = next
              updateJob(jobId, {
                status: payload.stage === 'done' ? 'done' : 'running',
                stage: payload.stage,
                markdown_path: payload.document?.markdownPath || payload.markdownPath || undefined,
                extracted_json: payload.extracted ? JSON.stringify(payload.extracted) : undefined,
              })
              emitJob(jobId, 'progress', {
                stage: payload.stage,
                progress: next.progress,
                message: payload.message,
                project: next,
              })
              if (payload.stage === 'done') {
                finishJob(jobId, {
                  status: 'done',
                  extracted_json: payload.extracted ? JSON.stringify(payload.extracted) : null,
                  response_json: JSON.stringify({
                    provider: payload.extract === false ? 'docling' : config.llmApiUrl ? 'qwen' : 'heuristic',
                    model: config.llmModel,
                    mode,
                    files: (next.documents || []).map((item) => item.fileName),
                  }),
                  error: null,
                  finished_at: nowIso(),
                })
                emitJob(jobId, 'done', { project: next, extracted: payload.extracted || null })
                closeJobStream(jobId)
              }
            }

            if (mode === 'convert') {
              await runConvertDocuments({ project: latest, documents, onProgress })
            } else {
              await runExtractDocuments({
                project: withJobPaths(latest),
                notes,
                prompt,
                onProgress,
              })
            }
          } catch (error) {
            const current = getProject(project.id) || latest
            const failedAt =
              error?.failedAt ||
              (current.markdownReady || current.markdownPreview ? 'extracting' : 'converting')
            const markdownPreview = error?.markdownPreview || current.markdownPreview
            const message = error instanceof Error ? error.message : String(error)
            console.error(`[job ${jobId}] ${message}`)
            let documentsNext = current.documents || []
            if (error?.documentId) {
              documentsNext = documentsNext.map((item) =>
                item.id === error.documentId ? { ...item, status: 'error', error: message } : item,
              )
            }
            const failed = saveProject({
              ...current,
              documents: documentsNext,
              ...summarizeDocuments(documentsNext),
              status: 'error',
              pipelineStage: 'error',
              pipelineFailedAt: failedAt,
              pipelineMessage: message,
              markdownPreview,
              markdownReady: Boolean(markdownPreview || summarizeDocuments(documentsNext).markdownReady),
              markdownChars: error?.markdownChars || current.markdownChars,
              updatedAt: nowIso(),
            })
            finishJob(jobId, {
              status: 'error',
              extracted_json: null,
              response_json: JSON.stringify({
                failedAt,
                markdownPath: error?.markdownPath || (current.markdownPreview ? 'saved' : null),
              }),
              error: message,
              finished_at: nowIso(),
            })
            updateJob(jobId, { stage: 'error', markdown_path: error?.markdownPath || undefined })
            emitJob(jobId, 'failed', { message, project: failed, failedAt })
            closeJobStream(jobId)
          } finally {
            resolve()
          }
        })()
      }),
  )
  jobChain.set(project.id, run)
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
      llmProbe: getLastLlmProbe(),
      model: config.llmModel,
    },
  })
})

app.get('/api/health/llm', async (req, res) => {
  const force = req.query.refresh === '1' || req.query.force === '1'
  const probe = await probeLlm({ force })
  res.json(probe)
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

app.delete('/api/projects/:id', (req, res) => {
  const project = getProject(req.params.id)
  if (!project) return res.status(404).json({ error: 'not_found', message: 'Проект не найден' })
  abortPipeline(req.params.id)
  deleteProject(req.params.id)
  res.json({ ok: true, id: req.params.id })
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
  upload.any()(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message })
    const files = (req.files || []).filter((item) => item.fieldname === 'file' || item.fieldname === 'files')
    if (!files.length) return res.status(400).json({ error: 'file_required' })

    let project = getProject(req.params.id)
    const now = nowIso()
    if (!project) {
      project = saveProject({
        id: req.params.id,
        name: '',
        fileName: null,
        fileSize: null,
        documents: [],
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
    const incoming = files.map((file) => ({
      id: uid('doc'),
      fileName: decodeOriginalName(file.originalname),
      fileSize: file.size,
      filePath: file.path,
      status: 'converting',
      markdownReady: false,
      uploadedAt: now,
    }))
    const documents = [...(project.documents || []), ...incoming]
    const prompt = getPrompt()
    const jobId = uid('job')
    const next = saveProject({
      ...project,
      documents,
      ...summarizeDocuments(documents),
      notes,
      status: 'processing',
      progress: 5,
      pipelineStage: 'converting',
      pipelineMessage:
        incoming.length > 1
          ? `Принято ${incoming.length} файла. Docling готовит Markdown…`
          : 'Файл принят. Docling готовит Markdown…',
      updatedAt: now,
    })

    insertJob({
      id: jobId,
      project_id: next.id,
      status: 'running',
      file_name: incoming.map((item) => item.fileName).join(', '),
      file_path: incoming[0].filePath,
      file_size: incoming.reduce((sum, item) => sum + item.fileSize, 0),
      notes,
      prompt_snapshot: prompt ? JSON.stringify(prompt) : null,
      extracted_json: null,
      response_json: null,
      error: null,
      created_at: now,
      finished_at: null,
    })
    updateJob(jobId, { stage: 'converting' })
    startPipelineJob({
      jobId,
      project: next,
      mode: 'convert',
      documents: incoming,
      notes,
      prompt,
    })
    res.json({ project: next, job: getJob(jobId) })
  })
})

app.post('/api/projects/:id/analyze', (req, res) => {
  const existing = getProject(req.params.id)
  if (!existing) return res.status(404).json({ error: 'not_found' })
  const project = withJobPaths(existing)
  const ready = (project.documents || []).filter((item) => item.filePath || item.markdownReady || item.markdownPreview)
  if (!ready.length) {
    return res.status(400).json({ error: 'file_required', message: 'Сначала загрузите файлы проекта.' })
  }

  const notes = req.body?.notes || project.notes || ''
  const prompt = getPrompt()
  const jobId = uid('job')
  const next = saveProject({
    ...project,
    notes,
    status: 'processing',
    progress: 5,
    pipelineStage: 'extracting',
    pipelineMessage: `Отправляю ${ready.length} Markdown в Qwen…`,
    updatedAt: nowIso(),
  })
  insertJob({
    id: jobId,
    project_id: next.id,
    status: 'running',
    file_name: ready.map((item) => item.fileName).join(', '),
    file_path: ready[0].filePath || null,
    file_size: ready.reduce((sum, item) => sum + (item.fileSize || 0), 0),
    notes,
    prompt_snapshot: prompt ? JSON.stringify(prompt) : null,
    extracted_json: null,
    response_json: null,
    error: null,
    created_at: nowIso(),
    finished_at: null,
  })
  updateJob(jobId, { stage: 'extracting' })
  startPipelineJob({
    jobId,
    project: next,
    mode: 'extract',
    notes,
    prompt,
  })
  res.json({ project: next, job: getJob(jobId) })
})

app.get('/api/projects/:id/markdown', (req, res) => {
  const project = withJobPaths(getProject(req.params.id) || {})
  const combined = combineDocumentsMarkdown(project.documents || [])
  if (combined.trim()) {
    res.type('text/markdown; charset=utf-8')
    res.send(combined)
    return
  }
  if (project.markdownPreview) {
    res.type('text/markdown; charset=utf-8')
    res.send(project.markdownPreview)
    return
  }
  res.status(404).json({
    error: 'markdown_not_ready',
    message: 'Markdown не создан — ошибка случилась на этапе Docling, до модели.',
  })
})

app.get('/api/projects/:id/documents/:docId/markdown', (req, res) => {
  const project = withJobPaths(getProject(req.params.id) || {})
  const doc = (project.documents || []).find((item) => item.id === req.params.docId)
  if (!doc) return res.status(404).json({ error: 'not_found' })
  const body = readDocumentMarkdown(doc)
  if (!body.trim()) {
    return res.status(404).json({ error: 'markdown_not_ready', message: 'У этого файла ещё нет Markdown.' })
  }
  res.type('text/markdown; charset=utf-8')
  res.send(body)
})

app.delete('/api/projects/:id/documents/:docId', (req, res) => {
  const project = getProject(req.params.id)
  if (!project) return res.status(404).json({ error: 'not_found' })
  const documents = (project.documents || []).filter((item) => item.id !== req.params.docId)
  const next = saveProject({
    ...project,
    documents,
    ...summarizeDocuments(documents),
    updatedAt: nowIso(),
  })
  res.json(next)
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

app.listen(PORT, () => {
  console.log(`VTBIH API http://localhost:${PORT}`)
  console.log(`Docling ${config.doclingUrl || 'не задан'} · Qwen ${config.llmApiUrl || 'не задан'} · ${config.llmModel}`)
  void probeLlm({ force: true }).then((probe) => {
    if (!probe.configured) {
      console.log('[llm probe] пропущен: SUMMARY_API_BASE_URL не задан')
      return
    }
    console.log(
      probe.ok
        ? `[llm probe] работает (${probe.latencyMs} мс): ${probe.reply}`
        : `[llm probe] не работает: ${probe.error}`,
    )
  })
})
