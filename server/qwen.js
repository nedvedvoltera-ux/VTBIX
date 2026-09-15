import { config } from './config.js'
import { describeNetworkError, fetchOrThrow } from './httpErrors.js'
import { extractJsonObject, stripThink } from './jsonRepair.js'

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

async function chat(messages, { stream, signal, jsonMode, extras = true, maxTokens } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (config.llmApiKey) headers.Authorization = `Bearer ${config.llmApiKey}`

  const body = {
    model: config.llmModel,
    temperature: config.llmTemperature,
    max_tokens: maxTokens || config.llmMaxTokens,
    messages,
    stream,
  }
  if (jsonMode) body.response_format = { type: 'json_object' }
  if (extras && !config.llmEnableThinking) {
    body.enable_thinking = false
    body.chat_template_kwargs = { enable_thinking: false }
  }

  const response = await fetchOrThrow(
    `${config.llmApiUrl}/chat/completions`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
    },
    'Qwen',
  )
  return response
}

export async function extractWithQwen({ systemPrompt, userPrompt, signal, onPartial }) {
  if (!config.llmApiUrl) {
    throw new Error('LLM не задана: укажите SUMMARY_API_BASE_URL и SUMMARY_MODEL в .env')
  }

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]

  let jsonMode = true
  let extras = true
  let response = await chat(messages, { stream: true, signal, jsonMode, extras })
  if (response.status === 400) {
    jsonMode = false
    extras = false
    response = await chat(messages, { stream: true, signal, jsonMode, extras })
  }
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Qwen ${response.status}: ${body.slice(0, 400) || response.statusText}`)
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
    throw new Error('Qwen не вернула JSON с параметрами документа')
  }
  onPartial?.(finalParsed, raw)
  return { extracted: finalParsed, raw }
}

export async function pingLlm() {
  if (!config.llmApiUrl) return { ok: false, configured: false, model: config.llmModel }
  try {
    const headers = {}
    if (config.llmApiKey) headers.Authorization = `Bearer ${config.llmApiKey}`
    const response = await fetch(`${config.llmApiUrl}/models`, {
      headers,
      signal: AbortSignal.timeout(2500),
    })
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      return {
        ok: false,
        configured: true,
        model: config.llmModel,
        url: config.llmApiUrl,
        error: `Qwen ${response.status}: ${body.slice(0, 200) || response.statusText}`,
      }
    }
    return { ok: true, configured: true, model: config.llmModel, url: config.llmApiUrl }
  } catch (error) {
    return {
      ok: false,
      configured: true,
      model: config.llmModel,
      url: config.llmApiUrl,
      error: describeNetworkError(error, { service: 'Qwen', url: `${config.llmApiUrl}/models` }),
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

function storeProbe(probe) {
  lastProbe = probe
  return probe
}

async function runLlmProbe() {
  const checkedAt = new Date().toISOString()
  if (!config.llmApiUrl) {
    return storeProbe({
      ok: false,
      configured: false,
      model: config.llmModel,
      error: 'SUMMARY_API_BASE_URL не задан — тестовый запрос не отправлен',
      checkedAt,
    })
  }

  const started = Date.now()
  const url = `${config.llmApiUrl}/chat/completions`
  const messages = [{ role: 'user', content: 'Ответь строго одним словом: PONG' }]

  try {
    let response = await chat(messages, {
      stream: false,
      jsonMode: false,
      extras: true,
      maxTokens: 24,
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    })
    if (response.status === 400) {
      response = await chat(messages, {
        stream: false,
        jsonMode: false,
        extras: false,
        maxTokens: 24,
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      })
    }

    const latencyMs = Date.now() - started
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      const probe = storeProbe({
        ok: false,
        configured: true,
        model: config.llmModel,
        url: config.llmApiUrl,
        latencyMs,
        error: `Qwen ${response.status}: ${body.slice(0, 240) || response.statusText}`,
        checkedAt: new Date().toISOString(),
      })
      console.warn(`[llm probe] fail ${probe.error}`)
      return probe
    }

    const payload = await response.json()
    const reply = stripThink(String(payload?.choices?.[0]?.message?.content || '')).trim()
    const probe = storeProbe({
      ok: Boolean(reply),
      configured: true,
      model: config.llmModel,
      url: config.llmApiUrl,
      latencyMs,
      reply: reply.slice(0, 80),
      matched: /pong/i.test(reply),
      error: reply ? undefined : 'модель вернула пустой ответ',
      checkedAt: new Date().toISOString(),
    })
    console.log(
      probe.ok
        ? `[llm probe] ok ${latencyMs}ms ${probe.reply}`
        : `[llm probe] fail ${probe.error}`,
    )
    return probe
  } catch (error) {
    const probe = storeProbe({
      ok: false,
      configured: true,
      model: config.llmModel,
      url: config.llmApiUrl,
      latencyMs: Date.now() - started,
      error: describeNetworkError(error, { service: 'Qwen', url }),
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
