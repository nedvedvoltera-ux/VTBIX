import { config } from './config.js'
import { describeNetworkError, fetchOrThrow } from './httpErrors.js'
import { extractJsonObject, stripThink } from './jsonRepair.js'
import { resolveLlmRuntime } from './llmSettings.js'

async function readSseContent(response, onDelta) {
  const reader = response.body?.getReader()
  if (!reader) {
    const text = await response.text()
    const parsed = JSON.parse(text)
    const content = parsed?.choices?.[0]?.message?.content || ''
    if (content) onDelta(content)
    return content
  }

  const decoder = new TextDecoder()
  let buffer = ''
  let content = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const chunks = buffer.split('\n')
    buffer = chunks.pop() || ''
    for (const line of chunks) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const data = trimmed.slice(5).trim()
      if (!data || data === '[DONE]') continue
      try {
        const json = JSON.parse(data)
        const delta = json?.choices?.[0]?.delta?.content || json?.choices?.[0]?.message?.content || ''
        if (delta) {
          content += delta
          onDelta(content)
        }
      } catch {
        // keep reading
      }
    }
  }

  return content
}

function runtimeMeta(runtime) {
  return {
    source: runtime.source,
    provider: runtime.provider,
    label: runtime.label,
    model: runtime.model,
    url: runtime.apiUrl,
  }
}

function notConfiguredError(runtime) {
  if (runtime.source === 'cloud') {
    const missing = (runtime.missing || []).join(', ') || 'API-ключ'
    return `Облачная LLM не настроена: укажите ${missing} в Настройках`
  }
  return 'Локальная LLM не задана: укажите SUMMARY_API_BASE_URL в .env или выберите облако в Настройках'
}

function buildHeaders(runtime) {
  const headers = { 'Content-Type': 'application/json', ...(runtime.extraHeaders || {}) }
  if (runtime.protocol === 'anthropic') {
    if (runtime.apiKey) headers['x-api-key'] = runtime.apiKey
    headers['anthropic-version'] = '2023-06-01'
    return headers
  }
  if (runtime.apiKey) headers.Authorization = `Bearer ${runtime.apiKey}`
  return headers
}

async function chatOpenAI(runtime, messages, { stream, signal, jsonMode, extras = true, maxTokens } = {}) {
  const body = {
    model: runtime.model,
    temperature: config.llmTemperature,
    max_tokens: maxTokens || config.llmMaxTokens,
    messages,
    stream,
  }
  if (jsonMode) body.response_format = { type: 'json_object' }
  if (extras && runtime.extras && !config.llmEnableThinking) {
    body.enable_thinking = false
    body.chat_template_kwargs = { enable_thinking: false }
  }

  return fetchOrThrow(
    `${runtime.apiUrl}/chat/completions`,
    {
      method: 'POST',
      headers: buildHeaders(runtime),
      body: JSON.stringify(body),
      signal,
    },
    runtime.service,
  )
}

async function chatAnthropic(runtime, messages, { signal, maxTokens } = {}) {
  const system = messages
    .filter((item) => item.role === 'system')
    .map((item) => item.content)
    .join('\n\n')
  const rest = messages
    .filter((item) => item.role !== 'system')
    .map((item) => ({
      role: item.role === 'assistant' ? 'assistant' : 'user',
      content: item.content,
    }))
  const body = {
    model: runtime.model,
    max_tokens: maxTokens || config.llmMaxTokens,
    temperature: config.llmTemperature,
    messages: rest,
    stream: false,
  }
  if (system) body.system = system
  return fetchOrThrow(
    `${runtime.apiUrl}/messages`,
    {
      method: 'POST',
      headers: buildHeaders(runtime),
      body: JSON.stringify(body),
      signal,
    },
    runtime.service,
  )
}

async function readAnthropicText(response) {
  const payload = await response.json()
  const parts = Array.isArray(payload?.content) ? payload.content : []
  return parts.map((part) => (typeof part?.text === 'string' ? part.text : '')).join('')
}

export async function completeJsonWithLlm({ systemPrompt, userPrompt, signal, onPartial, emptyError } = {}) {
  const runtime = resolveLlmRuntime()
  if (!runtime.configured) {
    throw new Error(notConfiguredError(runtime))
  }
  const failMessage = emptyError || `${runtime.service} не вернула JSON`

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]

  if (runtime.protocol === 'anthropic') {
    const response = await chatAnthropic(runtime, messages, { signal })
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(`${runtime.service} ${response.status}: ${body.slice(0, 400) || response.statusText}`)
    }
    const raw = stripThink(await readAnthropicText(response))
    const finalParsed = extractJsonObject(raw)
    if (!finalParsed || typeof finalParsed !== 'object') {
      throw new Error(failMessage)
    }
    onPartial?.(finalParsed, raw)
    return { extracted: finalParsed, raw }
  }

  let jsonMode = true
  let extras = true
  let response = await chatOpenAI(runtime, messages, { stream: true, signal, jsonMode, extras })
  if (response.status === 400) {
    jsonMode = false
    extras = false
    response = await chatOpenAI(runtime, messages, { stream: true, signal, jsonMode, extras })
  }
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`${runtime.service} ${response.status}: ${body.slice(0, 400) || response.statusText}`)
  }

  let lastEmit = 0
  let lastParsed = null
  const raw = stripThink(
    await readSseContent(response, (content) => {
      const parsed = extractJsonObject(content)
      if (!parsed) return
      lastParsed = parsed
      const now = Date.now()
      if (now - lastEmit < 400) return
      lastEmit = now
      onPartial?.(parsed, content)
    }),
  )

  const finalParsed = extractJsonObject(raw) || lastParsed
  if (!finalParsed || typeof finalParsed !== 'object') {
    throw new Error(failMessage)
  }
  onPartial?.(finalParsed, raw)
  return { extracted: finalParsed, raw }
}

export async function extractWithQwen(opts) {
  const runtime = resolveLlmRuntime()
  return completeJsonWithLlm({
    ...opts,
    emptyError: `${runtime.service || 'LLM'} не вернула JSON с параметрами документа`,
  })
}

export async function pingLlm() {
  const runtime = resolveLlmRuntime()
  if (!runtime.configured) {
    return { ok: false, configured: false, ...runtimeMeta(runtime), error: notConfiguredError(runtime) }
  }
  try {
    const response = await fetch(`${runtime.apiUrl}/models`, {
      headers: buildHeaders(runtime),
      signal: AbortSignal.timeout(2500),
    })
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      return {
        ok: false,
        configured: true,
        ...runtimeMeta(runtime),
        error: `${runtime.service} ${response.status}: ${body.slice(0, 200) || response.statusText}`,
      }
    }
    return { ok: true, configured: true, ...runtimeMeta(runtime) }
  } catch (error) {
    return {
      ok: false,
      configured: true,
      ...runtimeMeta(runtime),
      error: describeNetworkError(error, { service: runtime.service, url: `${runtime.apiUrl}/models` }),
    }
  }
}

const PROBE_TTL_MS = 30_000
const PROBE_TIMEOUT_MS = 20_000
let lastProbe = null
let probeInFlight = null

export function getLastLlmProbe() {
  return lastProbe
}

export function resetLlmProbe() {
  lastProbe = null
  probeInFlight = null
}

function storeProbe(probe) {
  lastProbe = probe
  return probe
}

async function runLlmProbe() {
  const runtime = resolveLlmRuntime()
  const checkedAt = new Date().toISOString()
  if (!runtime.configured) {
    return storeProbe({
      ok: false,
      configured: false,
      ...runtimeMeta(runtime),
      error: notConfiguredError(runtime),
      checkedAt,
    })
  }

  const started = Date.now()
  const messages = [{ role: 'user', content: 'Ответь строго одним словом: PONG' }]
  const url =
    runtime.protocol === 'anthropic' ? `${runtime.apiUrl}/messages` : `${runtime.apiUrl}/chat/completions`

  try {
    let response
    if (runtime.protocol === 'anthropic') {
      response = await chatAnthropic(runtime, messages, {
        maxTokens: 24,
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      })
    } else {
      response = await chatOpenAI(runtime, messages, {
        stream: false,
        jsonMode: false,
        extras: true,
        maxTokens: 24,
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      })
      if (response.status === 400) {
        response = await chatOpenAI(runtime, messages, {
          stream: false,
          jsonMode: false,
          extras: false,
          maxTokens: 24,
          signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
        })
      }
    }

    const latencyMs = Date.now() - started
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      const probe = storeProbe({
        ok: false,
        configured: true,
        ...runtimeMeta(runtime),
        latencyMs,
        error: `${runtime.service} ${response.status}: ${body.slice(0, 240) || response.statusText}`,
        checkedAt: new Date().toISOString(),
      })
      console.warn(`[llm probe] fail ${probe.error}`)
      return probe
    }

    let reply = ''
    if (runtime.protocol === 'anthropic') {
      reply = stripThink(await readAnthropicText(response)).trim()
    } else {
      const payload = await response.json()
      reply = stripThink(String(payload?.choices?.[0]?.message?.content || '')).trim()
    }

    const probe = storeProbe({
      ok: Boolean(reply),
      configured: true,
      ...runtimeMeta(runtime),
      latencyMs,
      reply: reply.slice(0, 80),
      matched: /pong/i.test(reply),
      error: reply ? undefined : 'модель вернула пустой ответ',
      checkedAt: new Date().toISOString(),
    })
    console.log(
      probe.ok ? `[llm probe] ok ${latencyMs}ms ${probe.reply}` : `[llm probe] fail ${probe.error}`,
    )
    return probe
  } catch (error) {
    const probe = storeProbe({
      ok: false,
      configured: true,
      ...runtimeMeta(runtime),
      latencyMs: Date.now() - started,
      error: describeNetworkError(error, { service: runtime.service, url }),
      checkedAt: new Date().toISOString(),
    })
    console.warn(`[llm probe] fail ${probe.error}`)
    return probe
  }
}

export async function probeLlm({ force = false } = {}) {
  if (!force && lastProbe?.checkedAt) {
    const age = Date.now() - Date.parse(lastProbe.checkedAt)
    if (Number.isFinite(age) && age < PROBE_TTL_MS) return { ...lastProbe, cached: true }
  }
  if (probeInFlight) return probeInFlight
  probeInFlight = runLlmProbe().finally(() => {
    probeInFlight = null
  })
  return probeInFlight
}
