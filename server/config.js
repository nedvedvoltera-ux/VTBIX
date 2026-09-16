import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

function loadDotEnv() {
  const envPath = path.join(rootDir, '.env')
  if (!fs.existsSync(envPath)) return
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (process.env[key] == null || process.env[key] === '') process.env[key] = value
  }
}

loadDotEnv()

function num(name, fallback) {
  const raw = Number(process.env[name])
  return Number.isFinite(raw) && raw > 0 ? raw : fallback
}

export function normalizeLlmBase(url) {
  if (!url) return ''
  const trimmed = url.replace(/\/$/, '')
  if (/\/v1$/i.test(trimmed) || /\/v1\//i.test(trimmed)) return trimmed.replace(/\/chat\/completions$/i, '')
  return `${trimmed}/v1`
}

const summaryUrl = process.env.SUMMARY_API_BASE_URL || process.env.LLM_API_URL || ''
const summaryModel = process.env.SUMMARY_MODEL || process.env.LLM_MODEL || 'Qwen/Qwen3.5-35B-A3B-FP8'
const thinkingRaw = (process.env.SUMMARY_ENABLE_THINKING || process.env.LLM_ENABLE_THINKING || 'false').toLowerCase()

export const config = {
  port: num('PORT', 8080),
  doclingUrl: (process.env.DOCLING_URL || '').replace(/\/$/, ''),
  doclingTimeoutMs: num('DOCLING_TIMEOUT_MS', 900_000),
  doclingTableMode: process.env.DOCLING_TABLE_MODE || 'accurate',
  llmApiUrl: normalizeLlmBase(summaryUrl),
  llmApiKey: process.env.SUMMARY_API_KEY || process.env.LLM_API_KEY || '',
  llmModel: summaryModel,
  llmEnableThinking: thinkingRaw === '1' || thinkingRaw === 'true',
  llmTemperature: Number.parseFloat(process.env.LLM_TEMPERATURE || process.env.SUMMARY_TEMPERATURE || '0.1') || 0.1,
  llmMaxTokens: num('LLM_MAX_TOKENS', num('SUMMARY_MAX_TOKENS', 8192)),
  llmTimeoutMs: num('LLM_TIMEOUT_MS', 300_000),
  llmMaxDocChars: num('LLM_MAX_DOC_CHARS', 80_000),
  braveSearchApiKey: process.env.BRAVE_SEARCH_API_KEY || '',
}

export function pipelineEnabled() {
  return Boolean(config.doclingUrl || config.llmApiUrl)
}
