import { describe, expect, it } from 'vitest'

import {
  buildMediaInstructions,
  buildMediaPreview,
  DEFAULT_MEDIA_KEYWORDS,
  DEFAULT_MEDIA_PROMPT,
  DEFAULT_MEDIA_SITES,
  hydrateMediaPrompt,
  MEDIA_JSON_SCHEMA,
  normalizeDomain,
} from '../../server/mediaPrompt.js'

describe('нормализация домена', () => {
  it('пустой ввод', () => {
    expect(normalizeDomain('')).toBe('')
    expect(normalizeDomain(null)).toBe('')
    expect(normalizeDomain(undefined)).toBe('')
  })

  it('снимает протокол, www и путь', () => {
    expect(normalizeDomain('https://www.RBC.ru/news/123')).toBe('rbc.ru')
    expect(normalizeDomain('http://tass.ru/')).toBe('tass.ru')
    expect(normalizeDomain('WWW.Interfax.RU')).toBe('interfax.ru')
  })

  it('домен без протокола проходит как есть', () => {
    expect(normalizeDomain('kommersant.ru')).toBe('kommersant.ru')
    expect(normalizeDomain('  vedomosti.ru  ')).toBe('vedomosti.ru')
  })

  it('поддомен сохраняется', () => {
    expect(normalizeDomain('news.rambler.ru/politics')).toBe('news.rambler.ru')
  })
})

describe('DEFAULT_MEDIA_PROMPT', () => {
  it('значения по умолчанию на месте', () => {
    expect(DEFAULT_MEDIA_PROMPT.searchMode).toBe('sites')
    expect(DEFAULT_MEDIA_PROMPT.language).toBe('ru')
    expect(DEFAULT_MEDIA_PROMPT.lookbackDays).toBe(14)
    expect(DEFAULT_MEDIA_PROMPT.maxResults).toBe(12)
    expect(DEFAULT_MEDIA_KEYWORDS.length).toBeGreaterThan(0)
    expect(DEFAULT_MEDIA_SITES).toContain('interfax.ru')
  })

  it('схема публикации содержит ключевые поля решения', () => {
    const row = MEDIA_JSON_SCHEMA.publications[0]
    for (const field of ['title', 'url', 'source', 'newsStage', 'concessionAngle', 'nextStep', 'fit', 'score']) {
      expect(row).toHaveProperty(field)
    }
  })
})

describe('hydrateMediaPrompt', () => {
  it('мусор на входе даёт настройки по умолчанию', () => {
    expect(hydrateMediaPrompt(null)).toEqual(hydrateMediaPrompt({}))
    expect(hydrateMediaPrompt('строка').searchMode).toBe('sites')
  })

  it('режим web только при точном значении', () => {
    expect(hydrateMediaPrompt({ searchMode: 'web' }).searchMode).toBe('web')
    expect(hydrateMediaPrompt({ searchMode: 'WEB' }).searchMode).toBe('sites')
    expect(hydrateMediaPrompt({ searchMode: 'что-то' }).searchMode).toBe('sites')
  })

  it('язык en только при точном значении', () => {
    expect(hydrateMediaPrompt({ language: 'en' }).language).toBe('en')
    expect(hydrateMediaPrompt({ language: 'de' }).language).toBe('ru')
  })

  it('глубина поиска зажимается в 1–90', () => {
    expect(hydrateMediaPrompt({ lookbackDays: 200 }).lookbackDays).toBe(90)
    expect(hydrateMediaPrompt({ lookbackDays: -5 }).lookbackDays).toBe(1)
    expect(hydrateMediaPrompt({ lookbackDays: 30 }).lookbackDays).toBe(30)
  })

  it('нуль и мусор в глубине падают в значение по умолчанию', () => {
    expect(hydrateMediaPrompt({ lookbackDays: 0 }).lookbackDays).toBe(14)
    expect(hydrateMediaPrompt({ lookbackDays: 'много' }).lookbackDays).toBe(14)
  })

  it('число результатов зажимается в 4–24', () => {
    expect(hydrateMediaPrompt({ maxResults: 100 }).maxResults).toBe(24)
    expect(hydrateMediaPrompt({ maxResults: 1 }).maxResults).toBe(4)
  })

  it('ключевые слова чистятся от дублей и пустот', () => {
    const cfg = hydrateMediaPrompt({ keywords: ['Концессия', 'концессия', '  ', 'ГЧП', ''] })
    expect(cfg.keywords).toEqual(['Концессия', 'ГЧП'])
  })

  it('сайты нормализуются и дедуплицируются', () => {
    const cfg = hydrateMediaPrompt({ sites: ['https://www.rbc.ru/news', 'rbc.ru', 'TASS.ru'] })
    expect(cfg.sites).toEqual(['rbc.ru', 'tass.ru'])
  })

  it('списки обрезаются до 40 позиций', () => {
    const many = Array.from({ length: 60 }, (_, i) => `слово${i}`)
    expect(hydrateMediaPrompt({ keywords: many }).keywords).toHaveLength(40)
  })

  it('пустая роль заменяется дефолтной', () => {
    expect(hydrateMediaPrompt({ role: '' }).role).toBe(DEFAULT_MEDIA_PROMPT.role)
    expect(hydrateMediaPrompt({ role: 'Свой аналитик' }).role).toBe('Свой аналитик')
  })
})

describe('buildMediaInstructions', () => {
  it('в режиме сайтов перечисляет источники', () => {
    const text = buildMediaInstructions({ searchMode: 'sites', sites: ['rbc.ru', 'tass.ru'] })
    expect(text).toContain('поиск только по сайтам: rbc.ru, tass.ru')
  })

  it('пустой список сайтов помечается', () => {
    const text = buildMediaInstructions({ searchMode: 'sites', sites: [] })
    expect(text).toContain('список пуст')
  })

  it('в режиме web не перечисляет сайты', () => {
    const text = buildMediaInstructions({ searchMode: 'web' })
    expect(text).toContain('поиск по открытому вебу')
  })

  it('английский язык меняет строку ответа', () => {
    expect(buildMediaInstructions({ language: 'en' })).toContain('Ответ пиши на English.')
  })

  it('требует только JSON и перечисляет поля', () => {
    const text = buildMediaInstructions({})
    expect(text).toContain('Верни ТОЛЬКО JSON')
    expect(text).toContain('concessionAngle')
    expect(text).toContain('fit (high|mid|low)')
  })

  it('особые указания попадают в конец', () => {
    const text = buildMediaInstructions({ extraInstructions: 'Только Сибирь' })
    expect(text.trimEnd().endsWith('Только Сибирь')).toBe(true)
  })

  it('превью совпадает с инструкцией', () => {
    const prompt = { searchMode: 'web', keywords: ['ГЧП'] }
    expect(buildMediaPreview(prompt)).toBe(buildMediaInstructions(prompt))
  })
})
