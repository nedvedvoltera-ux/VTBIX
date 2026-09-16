import { config, normalizeLlmBase } from './config.js'
import { getAppSettings, saveAppSettings } from './db.js'

export const LLM_PROVIDERS = [
  {
    id: 'openai',
    name: 'OpenAI',
    network: 'OpenAI',
    hint: 'GPT-4.1, GPT-4o и другие модели с platform.openai.com',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4.1', 'gpt-4o', 'gpt-4o-mini', 'o4-mini'],
    keyHint: 'sk-...',
    docsUrl: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'anthropic',
    name: 'Anthropic Claude',
    network: 'Anthropic',
    hint: 'Claude для длинных концессионных документов',
    baseUrl: 'https://api.anthropic.com/v1',
    protocol: 'anthropic',
    models: ['claude-sonnet-4-5', 'claude-sonnet-4-0', 'claude-3-5-haiku-latest'],
    keyHint: 'sk-ant-...',
    docsUrl: 'https://console.anthropic.com/settings/keys',
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    network: 'Google',
    hint: 'Gemini через OpenAI-совместимый endpoint',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    models: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'],
    keyHint: 'AIza...',
    docsUrl: 'https://aistudio.google.com/apikey',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    network: 'DeepSeek',
    hint: 'Публичный API DeepSeek, формат как у OpenAI',
    baseUrl: 'https://api.deepseek.com/v1',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    keyHint: 'sk-...',
    docsUrl: 'https://platform.deepseek.com/api_keys',
  },
  {
    id: 'grok',
    name: 'xAI Grok',
    network: 'xAI',
    hint: 'Grok через api.x.ai',
    baseUrl: 'https://api.x.ai/v1',
    models: ['grok-4', 'grok-3', 'grok-3-mini'],
    keyHint: 'xai-...',
    docsUrl: 'https://console.x.ai/',
  },
  {
    id: 'mistral',
    name: 'Mistral',
    network: 'Mistral',
    hint: 'Mistral Large / Small с console.mistral.ai',
    baseUrl: 'https://api.mistral.ai/v1',
    models: ['mistral-large-latest', 'mistral-small-latest'],
    keyHint: '...',
    docsUrl: 'https://console.mistral.ai/api-keys',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    network: 'OpenRouter',
    hint: 'Один ключ — несколько сетей: OpenAI, Claude, Gemini, Grok',
    baseUrl: 'https://openrouter.ai/api/v1',
    extraHeaders: { 'HTTP-Referer': 'https://vtbih.local', 'X-Title': 'VTBIH' },
    models: [
      'openai/gpt-4o',
      'anthropic/claude-sonnet-4.5',
      'google/gemini-2.5-pro',
      'x-ai/grok-4',
      'deepseek/deepseek-chat',
    ],
    keyHint: 'sk-or-...',
    docsUrl: 'https://openrouter.ai/keys',
  },
  {
    id: 'custom',
    name: 'Свой URL',
    network: 'Custom',
    hint: 'Любой OpenAI-совместимый /v1/chat/completions',
    baseUrl: '',
    models: [],
    allowCustomUrl: true,
    keyHint: 'Bearer-токен, если нужен',
  },
]

const PROVIDER_IDS = new Set(LLM_PROVIDERS.map((item) => item.id))

function providerById(id) {
  return LLM_PROVIDERS.find((item) => item.id === id) || LLM_PROVIDERS[0]
}

function maskKey(key) {
  const value = String(key || '')
  if (!value) return ''
  if (value.length <= 8) return '••••'
  return `${value.slice(0, 4)}…${value.slice(-4)}`
}

export function getStoredLlmSettings() {
  const llm = getAppSettings().llm || {}
  const source = llm.source === 'cloud' ? 'cloud' : 'local'
  const provider = PROVIDER_IDS.has(llm.provider) ? llm.provider : 'openai'
  return {
    source,
    provider,
    model: typeof llm.model === 'string' ? llm.model.trim() : '',
    apiKey: typeof llm.apiKey === 'string' ? llm.apiKey : '',
    baseUrl: typeof llm.baseUrl === 'string' ? llm.baseUrl.trim() : '',
  }
}

export async function saveLlmSettings(patch = {}) {
  const current = getStoredLlmSettings()
  const next = {
    source: patch.source === 'cloud' ? 'cloud' : patch.source === 'local' ? 'local' : current.source,
    provider: PROVIDER_IDS.has(patch.provider) ? patch.provider : current.provider,
    model: typeof patch.model === 'string' ? patch.model.trim() : current.model,
    apiKey: current.apiKey,
    baseUrl: typeof patch.baseUrl === 'string' ? patch.baseUrl.trim() : current.baseUrl,
  }
  if (patch.clearApiKey === true) next.apiKey = ''
  else if (typeof patch.apiKey === 'string' && patch.apiKey.trim()) next.apiKey = patch.apiKey.trim()
  const settings = getAppSettings()
  await saveAppSettings({ ...settings, llm: next })
  return next
}

export function resolveLlmRuntime() {
  const stored = getStoredLlmSettings()
  if (stored.source !== 'cloud') {
    return {
      source: 'local',
      provider: 'local',
      label: 'Локальная Qwen',
      service: 'Qwen',
      apiUrl: config.llmApiUrl,
      apiKey: config.llmApiKey,
      model: config.llmModel,
      extras: true,
      protocol: 'openai',
      extraHeaders: {},
      configured: Boolean(config.llmApiUrl),
    }
  }

  const provider = providerById(stored.provider)
  const apiUrl = normalizeLlmBase(provider.allowCustomUrl ? stored.baseUrl || provider.baseUrl : provider.baseUrl)
  const model = stored.model || provider.models[0] || ''
  const apiKey = stored.apiKey
  const missing = []
  if (!apiUrl) missing.push('URL')
  if (!apiKey) missing.push('API-ключ')
  if (!model) missing.push('модель')
  return {
    source: 'cloud',
    provider: provider.id,
    label: provider.name,
    service: provider.name,
    apiUrl,
    apiKey,
    model,
    extras: false,
    protocol: provider.protocol || 'openai',
    extraHeaders: provider.extraHeaders || {},
    configured: missing.length === 0,
    missing,
  }
}

export function publicLlmSettings() {
  const stored = getStoredLlmSettings()
  const runtime = resolveLlmRuntime()
  return {
    source: stored.source,
    provider: stored.provider,
    model: stored.model,
    baseUrl: stored.baseUrl,
    hasApiKey: Boolean(stored.apiKey),
    apiKeyMasked: maskKey(stored.apiKey),
    local: {
      configured: Boolean(config.llmApiUrl),
      url: config.llmApiUrl,
      model: config.llmModel,
    },
    providers: LLM_PROVIDERS.map(({ extraHeaders, ...item }) => item),
    active: {
      source: runtime.source,
      provider: runtime.provider,
      label: runtime.label,
      model: runtime.model,
      url: runtime.apiUrl,
      configured: runtime.configured,
      missing: runtime.missing || [],
    },
  }
}
