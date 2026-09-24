import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = { current: {} }

vi.mock('../../server/db.js', () => ({
  getAppSettings: () => store.current,
  saveAppSettings: async (payload) => {
    store.current = payload
    return payload
  },
}))

const { config } = await import('../../server/config.js')
const { publicLlmSettings, resolveLlmRuntime, saveLlmSettings } = await import('../../server/llmSettings.js')

describe('настройки LLM стенда', () => {
  beforeEach(() => {
    store.current = {}
  })

  it('без записи в базе берёт адрес и модель из окружения', () => {
    const runtime = resolveLlmRuntime()
    expect(runtime.source).toBe('local')
    expect(runtime.apiUrl).toBe(config.llmApiUrl)
    expect(runtime.model).toBe(config.llmModel)
    expect(publicLlmSettings().local.overridden).toBe(false)
  })

  it('сохраняет адрес и имя модели этого стенда и подставляет их в рантайм', async () => {
    await saveLlmSettings({
      source: 'local',
      localUrl: 'http://10.0.0.8:8080',
      localModel: 'stand-model',
    })
    const runtime = resolveLlmRuntime()
    expect(runtime.apiUrl).toBe('http://10.0.0.8:8080/v1')
    expect(runtime.model).toBe('stand-model')
    expect(runtime.configured).toBe(true)
    const local = publicLlmSettings().local
    expect(local.overridden).toBe(true)
    expect(local.savedModel).toBe('stand-model')
    expect(local.defaultModel).toBe(config.llmModel)
  })

  it('пустые поля возвращают значения окружения', async () => {
    await saveLlmSettings({ source: 'local', localUrl: 'http://10.0.0.8:8080', localModel: 'stand-model' })
    await saveLlmSettings({ source: 'local', localUrl: '  ', localModel: '' })
    const runtime = resolveLlmRuntime()
    expect(runtime.apiUrl).toBe(config.llmApiUrl)
    expect(runtime.model).toBe(config.llmModel)
  })
})
