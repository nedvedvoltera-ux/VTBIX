import { describe, expect, it } from 'vitest'

import { buildMediaPreview, DEFAULT_MEDIA_PROMPT, normalizeDomain } from '../../src/utils/mediaPrompt'
import { normalizeDomain as normalizeOnServer } from '../../server/mediaPrompt.js'
import type { MediaPromptConfig } from '../../src/types'

function config(extra: Partial<MediaPromptConfig> = {}): MediaPromptConfig {
  return { ...DEFAULT_MEDIA_PROMPT, ...extra }
}

describe('normalizeDomain', () => {
  it('снимает протокол, www и путь', () => {
    expect(normalizeDomain('https://www.RBC.ru/news/1')).toBe('rbc.ru')
    expect(normalizeDomain('http://tass.ru/')).toBe('tass.ru')
  })

  it('пустая строка остаётся пустой', () => {
    expect(normalizeDomain('')).toBe('')
    expect(normalizeDomain('   ')).toBe('')
  })

  it('чистый домен не меняется', () => {
    expect(normalizeDomain('kommersant.ru')).toBe('kommersant.ru')
  })

  it('совпадает с серверной нормализацией', () => {
    for (const value of ['https://www.RBC.ru/news', 'tass.ru', 'http://ria.ru/', 'news.rambler.ru/x', '']) {
      expect(normalizeDomain(value)).toBe(normalizeOnServer(value))
    }
  })
})

describe('DEFAULT_MEDIA_PROMPT', () => {
  it('поиск по списку сайтов на русском', () => {
    expect(DEFAULT_MEDIA_PROMPT.searchMode).toBe('sites')
    expect(DEFAULT_MEDIA_PROMPT.language).toBe('ru')
  })

  it('есть ключевые слова и источники', () => {
    expect(DEFAULT_MEDIA_PROMPT.keywords.length).toBeGreaterThan(0)
    expect(DEFAULT_MEDIA_PROMPT.sites.length).toBeGreaterThan(0)
  })

  it('глубина и лимит заданы разумно', () => {
    expect(DEFAULT_MEDIA_PROMPT.lookbackDays).toBeGreaterThan(0)
    expect(DEFAULT_MEDIA_PROMPT.maxResults).toBeGreaterThan(0)
  })
})

describe('buildMediaPreview', () => {
  it('показывает роль и ключевые слова', () => {
    const text = buildMediaPreview(config({ keywords: ['концессия', 'ГЧП'] }))
    expect(text).toContain(DEFAULT_MEDIA_PROMPT.role)
    expect(text).toContain('концессия, ГЧП')
  })

  it('в режиме сайтов перечисляет источники', () => {
    expect(buildMediaPreview(config({ searchMode: 'sites', sites: ['rbc.ru'] }))).toContain('rbc.ru')
  })

  it('в режиме web сайты не перечисляет', () => {
    expect(buildMediaPreview(config({ searchMode: 'web' }))).toContain('открытому вебу')
  })

  it('английский язык меняет строку', () => {
    expect(buildMediaPreview(config({ language: 'en' }))).toContain('English')
  })

  it('особые указания добавляются', () => {
    expect(buildMediaPreview(config({ extraInstructions: 'Только Сибирь' }))).toContain('Только Сибирь')
  })

  it('пустые ключевые слова помечаются', () => {
    expect(buildMediaPreview(config({ keywords: [] }))).toContain('не заданы')
  })
})
