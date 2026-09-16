import { describe, expect, it } from 'vitest'

import { config, normalizeLlmBase, pipelineEnabled } from '../../server/config.js'

describe('normalizeLlmBase', () => {
  it('пустой адрес', () => {
    expect(normalizeLlmBase('')).toBe('')
    expect(normalizeLlmBase(null)).toBe('')
    expect(normalizeLlmBase(undefined)).toBe('')
  })

  it('добавляет /v1 к базовому адресу', () => {
    expect(normalizeLlmBase('http://192.168.215.74:9080')).toBe('http://192.168.215.74:9080/v1')
  })

  it('снимает завершающий слэш', () => {
    expect(normalizeLlmBase('http://host:9080/')).toBe('http://host:9080/v1')
    expect(normalizeLlmBase('http://host:9080/v1/')).toBe('http://host:9080/v1')
  })

  it('не дублирует /v1', () => {
    expect(normalizeLlmBase('http://host:9080/v1')).toBe('http://host:9080/v1')
  })

  it('отрезает лишний /chat/completions', () => {
    expect(normalizeLlmBase('http://host:9080/v1/chat/completions')).toBe('http://host:9080/v1')
  })

  it('адрес с путём получает /v1', () => {
    expect(normalizeLlmBase('https://api.example.com/openai')).toBe('https://api.example.com/openai/v1')
  })
})

describe('config', () => {
  it('порт и таймауты — положительные числа', () => {
    expect(config.port).toBeGreaterThan(0)
    expect(config.doclingTimeoutMs).toBeGreaterThan(0)
    expect(config.llmTimeoutMs).toBeGreaterThan(0)
    expect(config.llmMaxTokens).toBeGreaterThan(0)
    expect(config.llmMaxDocChars).toBeGreaterThan(0)
  })

  it('адрес модели уже нормализован', () => {
    expect(config.llmApiUrl).toBe(normalizeLlmBase(config.llmApiUrl))
  })

  it('адрес Docling без завершающего слэша', () => {
    expect(config.doclingUrl.endsWith('/')).toBe(false)
  })

  it('температура — число', () => {
    expect(Number.isFinite(config.llmTemperature)).toBe(true)
  })

  it('режим размышлений — булев', () => {
    expect(typeof config.llmEnableThinking).toBe('boolean')
  })
})

describe('pipelineEnabled', () => {
  it('совпадает с наличием адресов Docling или модели', () => {
    expect(pipelineEnabled()).toBe(Boolean(config.doclingUrl || config.llmApiUrl))
  })
})
