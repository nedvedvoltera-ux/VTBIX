export class PipelineError extends Error {
  constructor(failedAt, message, extra = {}) {
    super(message)
    this.name = 'PipelineError'
    this.failedAt = failedAt
    this.markdownPreview = extra.markdownPreview
    this.markdownPath = extra.markdownPath
    this.markdownChars = extra.markdownChars
  }
}

export function describeNetworkError(error, { service = 'Сервис', url = '' } = {}) {
  const raw = error instanceof Error ? error.message : String(error)
  if (/^Этап\s/.test(raw) || /^Docling\s/.test(raw) || /^Qwen\s/.test(raw)) return raw

  const cause = error?.cause
  const code = String(cause?.code || error?.code || '')
  const aborted = error?.name === 'TimeoutError' || /aborted|timeout/i.test(raw)

  const parts = []
  if (raw === 'fetch failed' || code === 'ECONNREFUSED' || code === 'UND_ERR_SOCKET') {
    parts.push(`${service} недоступен (сеть не дошла до сервиса)`)
  } else if (aborted || code === 'ETIMEDOUT' || code === 'UND_ERR_CONNECT_TIMEOUT') {
    parts.push(`${service} не ответил вовремя`)
  } else if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
    parts.push(`${service}: хост не найден`)
  } else {
    parts.push(`${service}: ${raw}`)
  }
  if (url) parts.push(`URL ${url}`)
  if (code) parts.push(`код ${code}`)
  if (cause?.message && cause.message !== raw) parts.push(String(cause.message))
  return parts.join('. ')
}

export async function fetchOrThrow(url, options, service) {
  try {
    return await fetch(url, options)
  } catch (error) {
    throw new Error(describeNetworkError(error, { service, url }))
  }
}
