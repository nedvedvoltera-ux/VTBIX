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

function mimeFor(fileName) {
  return MIME[path.extname(fileName).toLowerCase()] || 'application/octet-stream'
}

function isPlainText(fileName) {
  return /\.(csv|md|txt)$/i.test(fileName)
}

export async function convertToMarkdown({ filePath, fileName }) {
  if (isPlainText(fileName)) {
    const raw = await fs.readFile(filePath, 'utf8')
    return raw.trim() ? raw : `# ${fileName}\n\n(пустой файл)`
  }

  if (!config.doclingUrl) {
    throw new Error('Docling не задан: укажите DOCLING_URL в .env')
  }

  const bytes = await fs.readFile(filePath)
  const form = new FormData()
  form.append('files', new Blob([new Uint8Array(bytes)], { type: mimeFor(fileName) }), fileName)
  form.append('to_formats', 'md')
  form.append('table_mode', config.doclingTableMode)
  form.append('image_export_mode', 'placeholder')
  form.append('do_ocr', 'true')
  form.append('ocr_lang', 'ru')
  form.append('ocr_lang', 'en')
  form.append('abort_on_error', 'false')

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

  const payload = await response.json()
  const markdown =
    payload?.document?.md_content ||
    payload?.documents?.[0]?.md_content ||
    payload?.md_content ||
    ''

  if (!String(markdown).trim()) {
    const status = payload?.status || 'empty'
    throw new Error(`Docling вернул пустой Markdown (status: ${status})`)
  }

  return String(markdown)
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
