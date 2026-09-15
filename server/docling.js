import fs from 'node:fs/promises'
import path from 'node:path'
import { config } from './config.js'

const MIME = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.doc': 'application/msword',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xls': 'application/vnd.ms-excel',
  '.xlsm': 'application/vnd.ms-excel.sheet.macroEnabled.12',
  '.csv': 'text/csv',
  '.md': 'text/markdown',
  '.txt': 'text/plain',
}

const DONE = new Set(['success', 'successed', 'completed', 'complete'])
const FAILED = new Set(['failure', 'failed', 'error'])

function mimeFor(fileName) {
  return MIME[path.extname(fileName).toLowerCase()] || 'application/octet-stream'
}

function isPlainText(fileName) {
  return /\.(csv|md|txt)$/i.test(fileName)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function markdownFromPayload(payload) {
  return String(
    payload?.document?.md_content ||
      payload?.documents?.[0]?.md_content ||
      payload?.md_content ||
      '',
  )
}

async function buildForm(filePath, fileName) {
  const bytes = await fs.readFile(filePath)
  const form = new FormData()
  form.append('files', new Blob([new Uint8Array(bytes)], { type: mimeFor(fileName) }), fileName)
  form.append('to_formats', 'md')
  form.append('table_mode', config.doclingTableMode)
  form.append('image_export_mode', 'placeholder')
  form.append('abort_on_error', 'false')
  const pdf = /\.pdf$/i.test(fileName)
  form.append('do_ocr', pdf ? 'true' : 'false')
  if (pdf) {
    form.append('ocr_lang', 'ru')
    form.append('ocr_lang', 'en')
  }
  return form
}

function taskIdFrom(payload, response) {
  return (
    payload?.task_id ||
    payload?.taskId ||
    payload?.id ||
    response.headers.get('x-task-id') ||
    ''
  )
}

function taskStatus(payload) {
  return String(payload?.task_status || payload?.status || '').toLowerCase()
}

async function convertSync(filePath, fileName) {
  const form = await buildForm(filePath, fileName)
  const response = await fetch(`${config.doclingUrl}/v1/convert/file`, {
    method: 'POST',
    body: form,
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(config.doclingTimeoutMs),
  })
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Docling ${response.status}: ${body.slice(0, 400) || response.statusText}`)
  }
  return response.json()
}

async function pollTask(taskId, onProgress) {
  const started = Date.now()
  let ticks = 0
  while (Date.now() - started < config.doclingTimeoutMs) {
    const response = await fetch(
      `${config.doclingUrl}/v1/status/poll/${encodeURIComponent(taskId)}?wait=5`,
      { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(20_000) },
    )
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(`Docling poll ${response.status}: ${body.slice(0, 300) || response.statusText}`)
    }
    const payload = await response.json()
    const status = taskStatus(payload)
    ticks += 1
    const elapsed = Math.round((Date.now() - started) / 1000)
    await onProgress?.({
      stage: 'converting',
      progress: Math.min(34, 10 + ticks),
      message: `Docling разбирает документ… ${elapsed} с`,
    })
    if (DONE.has(status)) return payload
    if (FAILED.has(status)) {
      throw new Error(`Docling не смог разобрать файл (status: ${status})`)
    }
    await sleep(2000)
  }
  throw new Error(`Docling не уложился в ${Math.round(config.doclingTimeoutMs / 1000)} с`)
}

export async function convertToMarkdown({ filePath, fileName, onProgress }) {
  if (isPlainText(fileName)) {
    const raw = await fs.readFile(filePath, 'utf8')
    return raw.trim() ? raw : `# ${fileName}\n\n(пустой файл)`
  }

  if (!config.doclingUrl) {
    throw new Error('Docling не задан: укажите DOCLING_URL в .env')
  }

  await onProgress?.({
    stage: 'converting',
    progress: 10,
    message: 'Документ отправлен в Docling…',
  })

  const form = await buildForm(filePath, fileName)
  const queued = await fetch(`${config.doclingUrl}/v1/convert/file/async`, {
    method: 'POST',
    body: form,
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(60_000),
  })

  let payload
  if (queued.status === 404) {
    payload = await convertSync(filePath, fileName)
  } else if (!queued.ok) {
    const body = await queued.text().catch(() => '')
    throw new Error(`Docling ${queued.status}: ${body.slice(0, 400) || queued.statusText}`)
  } else {
    const accepted = await queued.json().catch(() => ({}))
    const id = taskIdFrom(accepted, queued)
    if (!id) {
      payload = accepted?.document ? accepted : await convertSync(filePath, fileName)
    } else {
      await pollTask(id, onProgress)
      const result = await fetch(`${config.doclingUrl}/v1/result/${encodeURIComponent(id)}`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(60_000),
      })
      if (!result.ok) {
        const body = await result.text().catch(() => '')
        throw new Error(`Docling result ${result.status}: ${body.slice(0, 400) || result.statusText}`)
      }
      payload = await result.json()
    }
  }

  const markdown = markdownFromPayload(payload)
  if (!markdown.trim()) {
    throw new Error(`Docling вернул пустой Markdown (status: ${payload?.status || 'empty'})`)
  }
  return markdown
}

export async function pingDocling() {
  if (!config.doclingUrl) return { ok: false, configured: false }
  try {
    const response = await fetch(`${config.doclingUrl}/health`, { signal: AbortSignal.timeout(2500) })
    if (response.ok) return { ok: true, configured: true }
    const fallback = await fetch(`${config.doclingUrl}/docs`, { signal: AbortSignal.timeout(2500) })
    return { ok: fallback.ok, configured: true }
  } catch (error) {
    return { ok: false, configured: true, error: error instanceof Error ? error.message : String(error) }
  }
}
