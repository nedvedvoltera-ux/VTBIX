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
  initDb,
  insertJob,
  listJobs,
  listProjects,
  nowIso,
  pingDb,
  saveProject,
  savePrompt,
  uid,
  updateJob,
} from './db.js'
import { pingDocling } from './docling.js'
import { combineDocumentsMarkdown, decodeOriginalName, readDocumentMarkdown, summarizeDocuments } from './documents.js'
import { closeJobStream, emitJob, subscribeJob } from './events.js'
import { publicLlmSettings, resolveLlmRuntime, saveLlmSettings } from './llmSettings.js'
import {
  convertHitToProject,
  getPublicMediaConfig,
  getPublicMediaHit,
  getPublicMediaStatus,
  listPublicMediaHits,
  putPublicMediaConfig,
  removeMediaHit,
  resetMediaHits,
  startMediaRun,
  updatePublicMediaHit,
} from './mediaMonitor.js'
import {
  addActivity,
  addContact,
  addPlan,
  createDeal,
  getPublicDeal,
  listCrmSources,
  listPublicDeals,
  lookupDeal,
  publicMailSettings,
  removeActivity,
  removeContact,
  removeDeal,
  removePlan,
  saveMailSettings,
  sendFromDeal,
  testMailConnection,
  updateContact,
  updateDeal,
  updatePlan,
} from './crm.js'
import { abortPipeline, mergeProjectProgress, runConvertDocuments, runExtractDocuments } from './pipeline.js'
import { getLastLlmProbe, pingLlm, probeLlm, resetLlmProbe } from './qwen.js'
import {
  attachUser,
  enforceAuth,
  handleAcceptInvite,
  handleAuthStatus,
  handleCreateUser,
  handleDeleteUser,
  handleInviteInfo,
  handleListUsers,
  handleLogin,
  handleLogout,
  handlePatchUser,
  handleSetup,
  handleSystemGet,
  handleSystemPut,
  requireAdmin,
  requireUsersAdmin,
} from './auth.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = config.port
const app = express()

app.use(cors({ origin: true, credentials: true }))
app.use(express.json({ limit: '8mb' }))
app.use(attachUser)
app.use(enforceAuth)

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

async function withJobPaths(project) {
  if (!project?.id) return project
  const jobs = await listJobs(project.id)
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
          let latest = (await getProject(project.id)) || project
          try {
            const onProgress = async (payload) => {
              latest = (await getProject(project.id)) || latest
              const next = await saveProject(mergeProjectProgress(latest, payload, (await getPrompt()) || prompt))
              latest = next
              await updateJob(jobId, {
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
                await finishJob(jobId, {
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
                project: await withJobPaths(latest),
                notes,
                prompt,
                onProgress,
              })
            }
          } catch (error) {
            const current = (await getProject(project.id)) || latest
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
            const failed = await saveProject({
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
            await finishJob(jobId, {
              status: 'error',
              extracted_json: null,
              response_json: JSON.stringify({
                failedAt,
                markdownPath: error?.markdownPath || (current.markdownPreview ? 'saved' : null),
              }),
              error: message,
              finished_at: nowIso(),
            })
            await updateJob(jobId, { stage: 'error', markdown_path: error?.markdownPath || undefined })
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

app.get('/api/auth/status', handleAuthStatus)
app.post('/api/auth/setup', handleSetup)
app.post('/api/auth/login', handleLogin)
app.post('/api/auth/logout', handleLogout)
app.get('/api/auth/invite/:token', handleInviteInfo)
app.post('/api/auth/invite/:token', handleAcceptInvite)

app.get('/api/settings/system', handleSystemGet)
app.put('/api/settings/system', handleSystemPut)

app.get('/api/users', requireUsersAdmin, handleListUsers)
app.post('/api/users', requireUsersAdmin, handleCreateUser)
app.patch('/api/users/:id', requireUsersAdmin, handlePatchUser)
app.delete('/api/users/:id', requireUsersAdmin, handleDeleteUser)

app.get('/api/health', async (_req, res) => {
  const [docling, llm, db] = await Promise.all([pingDocling(), pingLlm(), pingDb()])
  const runtime = resolveLlmRuntime()
  res.status(db.ok ? 200 : 503).json({
    ok: db.ok,
    service: 'vtbih-api',
    dataDir: DATA_DIR,
    db,
    pipeline: {
      docling,
      llm,
      llmProbe: getLastLlmProbe(),
      model: runtime.model,
      source: runtime.source,
      label: runtime.label,
      provider: runtime.provider,
    },
  })
})

app.get('/api/health/llm', async (req, res) => {
  const force = req.query.refresh === '1' || req.query.force === '1'
  const probe = await probeLlm({ force })
  res.json(probe)
})

app.get('/api/projects', async (_req, res) => {
  res.json(await listProjects())
})

app.get('/api/projects/:id', async (req, res) => {
  const project = await getProject(req.params.id)
  if (!project) return res.status(404).json({ error: 'not_found' })
  res.json(project)
})

app.put('/api/projects/:id', async (req, res) => {
  const project = await saveProject({ ...req.body, id: req.params.id })
  res.json(project)
})

app.delete('/api/projects/:id', async (req, res) => {
  const project = await getProject(req.params.id)
  if (!project) return res.status(404).json({ error: 'not_found', message: 'Проект не найден' })
  abortPipeline(req.params.id)
  await deleteProject(req.params.id)
  res.json({ ok: true, id: req.params.id })
})

app.post('/api/projects', async (req, res) => {
  const id = req.body?.id || uid('p')
  const now = nowIso()
  const project = await saveProject({
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
    void (async () => {
      const files = (req.files || []).filter((item) => item.fieldname === 'file' || item.fieldname === 'files')
      if (!files.length) return res.status(400).json({ error: 'file_required' })

      let project = await getProject(req.params.id)
      const now = nowIso()
      if (!project) {
        project = await saveProject({
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
      const prompt = await getPrompt()
      const jobId = uid('job')
      const next = await saveProject({
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

      await insertJob({
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
      await updateJob(jobId, { stage: 'converting' })
      startPipelineJob({
        jobId,
        project: next,
        mode: 'convert',
        documents: incoming,
        notes,
        prompt,
      })
      res.json({ project: next, job: await getJob(jobId) })
    })().catch((error) => {
      if (!res.headersSent) res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
    })
  })
})

app.post('/api/projects/:id/analyze', async (req, res) => {
  const existing = await getProject(req.params.id)
  if (!existing) return res.status(404).json({ error: 'not_found' })
  const project = await withJobPaths(existing)
  const ready = (project.documents || []).filter((item) => item.filePath || item.markdownReady || item.markdownPreview)
  if (!ready.length) {
    return res.status(400).json({ error: 'file_required', message: 'Сначала загрузите файлы проекта.' })
  }

  const notes = req.body?.notes || project.notes || ''
  const prompt = await getPrompt()
  const jobId = uid('job')
  const next = await saveProject({
    ...project,
    notes,
    status: 'processing',
    progress: 5,
    pipelineStage: 'extracting',
    pipelineMessage: `Отправляю ${ready.length} Markdown в Qwen…`,
    updatedAt: nowIso(),
  })
  await insertJob({
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
  await updateJob(jobId, { stage: 'extracting' })
  startPipelineJob({
    jobId,
    project: next,
    mode: 'extract',
    notes,
    prompt,
  })
  res.json({ project: next, job: await getJob(jobId) })
})

app.get('/api/projects/:id/markdown', async (req, res) => {
  const project = await withJobPaths((await getProject(req.params.id)) || {})
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

app.get('/api/projects/:id/documents/:docId/markdown', async (req, res) => {
  const project = await withJobPaths((await getProject(req.params.id)) || {})
  const doc = (project.documents || []).find((item) => item.id === req.params.docId)
  if (!doc) return res.status(404).json({ error: 'not_found' })
  const body = readDocumentMarkdown(doc)
  if (!body.trim()) {
    return res.status(404).json({ error: 'markdown_not_ready', message: 'У этого файла ещё нет Markdown.' })
  }
  res.type('text/markdown; charset=utf-8')
  res.send(body)
})

app.delete('/api/projects/:id/documents/:docId', async (req, res) => {
  const project = await getProject(req.params.id)
  if (!project) return res.status(404).json({ error: 'not_found' })
  const documents = (project.documents || []).filter((item) => item.id !== req.params.docId)
  const next = await saveProject({
    ...project,
    documents,
    ...summarizeDocuments(documents),
    updatedAt: nowIso(),
  })
  res.json(next)
})

app.get('/api/projects/:id/jobs', async (req, res) => {
  res.json(await listJobs(req.params.id))
})

app.get('/api/jobs', async (_req, res) => {
  res.json(await listJobs())
})

app.get('/api/jobs/:id', async (req, res) => {
  const job = await getJob(req.params.id)
  if (!job) return res.status(404).json({ error: 'not_found' })
  res.json(job)
})

app.get('/api/jobs/:id/stream', async (req, res) => {
  const job = await getJob(req.params.id)
  if (!job) return res.status(404).json({ error: 'not_found' })
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  if (typeof res.flushHeaders === 'function') res.flushHeaders()
  res.write(`event: snapshot\ndata: ${JSON.stringify({ job, project: await getProject(job.projectId) })}\n\n`)
  subscribeJob(job.id, res)
  if (job.status === 'done' || job.status === 'error') {
    emitJob(job.id, job.status === 'done' ? 'done' : 'failed', {
      project: await getProject(job.projectId),
      extracted: job.extracted,
      message: job.error,
    })
    closeJobStream(job.id)
  }
})

app.get('/api/prompt', async (_req, res) => {
  res.json(await getPrompt())
})

app.put('/api/prompt', async (req, res) => {
  res.json(await savePrompt(req.body))
})

app.get('/api/media/config', async (_req, res) => {
  res.json(await getPublicMediaConfig())
})

app.put('/api/media/config', async (req, res) => {
  res.json(await putPublicMediaConfig(req.body || {}))
})

app.get('/api/media/hits', async (_req, res) => {
  res.json(await listPublicMediaHits())
})

app.get('/api/media/hits/:id', async (req, res) => {
  const hit = await getPublicMediaHit(req.params.id)
  if (!hit) return res.status(404).json({ error: 'not_found', message: 'Инфоповод не найден' })
  res.json(hit)
})

app.patch('/api/media/hits/:id', async (req, res) => {
  const hit = await updatePublicMediaHit(req.params.id, req.body || {})
  if (!hit) return res.status(404).json({ error: 'not_found', message: 'Инфоповод не найден' })
  res.json(hit)
})

app.post('/api/media/hits/:id/project', async (req, res) => {
  const result = await convertHitToProject(req.params.id)
  if (!result) return res.status(404).json({ error: 'not_found', message: 'Инфоповод не найден' })
  res.status(result.existed ? 200 : 201).json(result)
})

app.delete('/api/media/hits/:id', async (req, res) => {
  const ok = await removeMediaHit(req.params.id)
  if (!ok) return res.status(404).json({ error: 'not_found', message: 'Инфоповод не найден' })
  res.json({ ok: true, id: req.params.id })
})

app.delete('/api/media/hits', async (_req, res) => {
  await resetMediaHits()
  res.json({ ok: true })
})

app.get('/api/media/status', async (_req, res) => {
  res.json(await getPublicMediaStatus())
})

function actorName(req) {
  return req.authUser?.name || 'Вы'
}

function sendCrmError(res, err) {
  const status = Number(err?.status) || 500
  res.status(status).json({ error: err?.code || 'crm', message: err?.message || 'Ошибка CRM' })
}

app.get('/api/crm/deals', async (_req, res) => {
  res.json(await listPublicDeals())
})

app.get('/api/crm/sources', async (_req, res) => {
  res.json(await listCrmSources())
})

app.get('/api/crm/lookup', async (req, res) => {
  res.json(await lookupDeal(req.query || {}))
})

app.post('/api/crm/deals', async (req, res) => {
  try {
    const result = await createDeal(req.body || {}, actorName(req))
    res.status(result.existed ? 200 : 201).json(result)
  } catch (err) {
    sendCrmError(res, err)
  }
})

app.get('/api/crm/deals/:id', async (req, res) => {
  const deal = await getPublicDeal(req.params.id)
  if (!deal) return res.status(404).json({ error: 'not_found', message: 'Карточка CRM не найдена' })
  res.json(deal)
})

app.patch('/api/crm/deals/:id', async (req, res) => {
  const deal = await updateDeal(req.params.id, req.body || {})
  if (!deal) return res.status(404).json({ error: 'not_found', message: 'Карточка CRM не найдена' })
  res.json(deal)
})

app.delete('/api/crm/deals/:id', async (req, res) => {
  const ok = await removeDeal(req.params.id)
  if (!ok) return res.status(404).json({ error: 'not_found', message: 'Карточка CRM не найдена' })
  res.json({ ok: true, id: req.params.id })
})

app.post('/api/crm/deals/:id/contacts', async (req, res) => {
  try {
    const deal = await addContact(req.params.id, req.body || {})
    if (!deal) return res.status(404).json({ error: 'not_found', message: 'Карточка CRM не найдена' })
    res.status(201).json(deal)
  } catch (err) {
    sendCrmError(res, err)
  }
})

app.patch('/api/crm/deals/:id/contacts/:cid', async (req, res) => {
  try {
    const deal = await updateContact(req.params.id, req.params.cid, req.body || {})
    if (!deal) return res.status(404).json({ error: 'not_found', message: 'Карточка CRM не найдена' })
    res.json(deal)
  } catch (err) {
    sendCrmError(res, err)
  }
})

app.delete('/api/crm/deals/:id/contacts/:cid', async (req, res) => {
  try {
    const deal = await removeContact(req.params.id, req.params.cid)
    if (!deal) return res.status(404).json({ error: 'not_found', message: 'Карточка CRM не найдена' })
    res.json(deal)
  } catch (err) {
    sendCrmError(res, err)
  }
})

app.post('/api/crm/deals/:id/activities', async (req, res) => {
  try {
    const deal = await addActivity(req.params.id, req.body || {}, actorName(req))
    if (!deal) return res.status(404).json({ error: 'not_found', message: 'Карточка CRM не найдена' })
    res.status(201).json(deal)
  } catch (err) {
    sendCrmError(res, err)
  }
})

app.delete('/api/crm/deals/:id/activities/:aid', async (req, res) => {
  const deal = await removeActivity(req.params.id, req.params.aid)
  if (!deal) return res.status(404).json({ error: 'not_found', message: 'Карточка CRM не найдена' })
  res.json(deal)
})

app.post('/api/crm/deals/:id/plans', async (req, res) => {
  try {
    const deal = await addPlan(req.params.id, req.body || {})
    if (!deal) return res.status(404).json({ error: 'not_found', message: 'Карточка CRM не найдена' })
    res.status(201).json(deal)
  } catch (err) {
    sendCrmError(res, err)
  }
})

app.patch('/api/crm/deals/:id/plans/:pid', async (req, res) => {
  try {
    const deal = await updatePlan(req.params.id, req.params.pid, req.body || {}, actorName(req))
    if (!deal) return res.status(404).json({ error: 'not_found', message: 'Карточка CRM не найдена' })
    res.json(deal)
  } catch (err) {
    sendCrmError(res, err)
  }
})

app.delete('/api/crm/deals/:id/plans/:pid', async (req, res) => {
  const deal = await removePlan(req.params.id, req.params.pid)
  if (!deal) return res.status(404).json({ error: 'not_found', message: 'Карточка CRM не найдена' })
  res.json(deal)
})

app.post('/api/crm/deals/:id/email', async (req, res) => {
  try {
    const result = await sendFromDeal(req.params.id, req.body || {}, actorName(req))
    if (!result) return res.status(404).json({ error: 'not_found', message: 'Карточка CRM не найдена' })
    res.json(result)
  } catch (err) {
    sendCrmError(res, err)
  }
})

app.get('/api/crm/mail', (_req, res) => {
  res.json(publicMailSettings())
})

app.put('/api/crm/mail', requireAdmin, async (req, res) => {
  res.json(await saveMailSettings(req.body || {}))
})

app.post('/api/crm/mail/test', requireAdmin, async (_req, res) => {
  try {
    res.json(await testMailConnection())
  } catch (err) {
    sendCrmError(res, err)
  }
})

app.post('/api/media/run', async (req, res) => {
  try {
    const job = await startMediaRun()
    res.status(202).json({ job })
  } catch (error) {
    const status = error?.status || 500
    res.status(status).json({
      error: error?.code || 'media_run',
      message: error instanceof Error ? error.message : String(error),
    })
  }
})

app.get('/api/settings/llm', requireAdmin, (_req, res) => {
  res.json(publicLlmSettings())
})

app.put('/api/settings/llm', requireAdmin, async (req, res) => {
  await saveLlmSettings(req.body || {})
  resetLlmProbe()
  res.json(publicLlmSettings())
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

try {
  await initDb()
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}

app.listen(PORT, () => {
  const runtime = resolveLlmRuntime()
  console.log(`VTBIH API http://localhost:${PORT}`)
  console.log(
    `PostgreSQL · Docling ${config.doclingUrl || 'не задан'} · ${runtime.label} ${runtime.apiUrl || 'не задана'} · ${runtime.model || 'без модели'}`,
  )
  void probeLlm({ force: true }).then((probe) => {
    if (!probe.configured) {
      console.log(`[llm probe] пропущен: ${probe.error || 'модель не настроена'}`)
      return
    }
    console.log(
      probe.ok
        ? `[llm probe] работает (${probe.latencyMs} мс): ${probe.reply}`
        : `[llm probe] не работает: ${probe.error}`,
    )
  })
})
