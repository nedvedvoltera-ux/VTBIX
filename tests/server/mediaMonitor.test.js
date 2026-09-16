import { describe, expect, it } from 'vitest'

import { hydrateInfovod, mediaStatus } from '../../server/mediaMonitor.js'

const RAW = {
  title: 'Регион ищет инвестора для платного моста',
  url: 'https://tass.ru/ekonomika/1',
  source: 'tass.ru',
}

describe('hydrateInfovod', () => {
  it('мусор на входе даёт null', () => {
    expect(hydrateInfovod(null)).toBeNull()
    expect(hydrateInfovod('строка')).toBeNull()
    expect(hydrateInfovod(42)).toBeNull()
  })

  it('без заголовка или ссылки инфоповод не создаётся', () => {
    expect(hydrateInfovod({ url: 'https://tass.ru/1' })).toBeNull()
    expect(hydrateInfovod({ title: 'Заголовок' })).toBeNull()
    expect(hydrateInfovod({ title: '   ', url: 'https://tass.ru/1' })).toBeNull()
  })

  it('минимальный инфоповод получает значения по умолчанию', () => {
    const hit = hydrateInfovod(RAW)
    expect(hit.title).toBe(RAW.title)
    expect(hit.url).toBe(RAW.url)
    expect(hit.country).toBe('Россия')
    expect(hit.fit).toBe('mid')
    expect(hit.decision).toBe('new')
    expect(hit.newsStage).toBe('other')
    expect(hit.notes).toBe('')
    expect(hit.projectId).toBeNull()
    expect(hit.score).toBeUndefined()
  })

  it('рабочее название берётся из name, потом projectName, потом заголовка', () => {
    expect(hydrateInfovod({ ...RAW, name: 'Мост' }).name).toBe('Мост')
    expect(hydrateInfovod({ ...RAW, projectName: 'Мост через Обь' }).name).toBe('Мост через Обь')
    expect(hydrateInfovod(RAW).name).toBe(RAW.title)
  })

  it('стадия новости приводится к списку', () => {
    expect(hydrateInfovod({ ...RAW, newsStage: 'tender' }).newsStage).toBe('tender')
    expect(hydrateInfovod({ ...RAW, newsStage: 'TENDER' }).newsStage).toBe('tender')
    expect(hydrateInfovod({ ...RAW, newsStage: 'придумано' }).newsStage).toBe('other')
  })

  it('решение по инфоповоду приводится к списку', () => {
    expect(hydrateInfovod({ ...RAW, decision: 'pursue' }).decision).toBe('pursue')
    expect(hydrateInfovod({ ...RAW, decision: 'dismissed' }).decision).toBe('dismissed')
    expect(hydrateInfovod({ ...RAW, decision: 'что-то' }).decision).toBe('new')
  })

  it('релевантность приводится к high/mid/low', () => {
    expect(hydrateInfovod({ ...RAW, fit: 'high' }).fit).toBe('high')
    expect(hydrateInfovod({ ...RAW, fit: 'LOW' }).fit).toBe('low')
    expect(hydrateInfovod({ ...RAW, fit: 'очень' }).fit).toBe('mid')
  })

  it('балл зажимается в 0–100', () => {
    expect(hydrateInfovod({ ...RAW, score: 150 }).score).toBe(100)
    expect(hydrateInfovod({ ...RAW, score: -10 }).score).toBe(0)
    expect(hydrateInfovod({ ...RAW, score: 71.4 }).score).toBe(71)
    expect(hydrateInfovod({ ...RAW, score: 'много' }).score).toBeUndefined()
  })

  it('бюджет вытаскивается из текстовой подсказки', () => {
    expect(hydrateInfovod({ ...RAW, budgetHint: 'около 12 млрд рублей' }).budgetEstimate).toBe(12_000_000_000)
    expect(hydrateInfovod({ ...RAW, budgetHint: '850 млн рублей' }).budgetEstimate).toBe(850_000_000)
    expect(hydrateInfovod({ ...RAW, budgetHint: '1,5 млрд' }).budgetEstimate).toBe(1_500_000_000)
  })

  it('подсказка без суммы не даёт оценку бюджета', () => {
    expect(hydrateInfovod({ ...RAW, budgetHint: 'сумма не раскрыта' }).budgetEstimate).toBeNull()
    expect(hydrateInfovod(RAW).budgetEstimate).toBeNull()
  })

  it('явная оценка бюджета важнее подсказки', () => {
    expect(hydrateInfovod({ ...RAW, budgetHint: '12 млрд', budgetEstimate: 5_000_000_000 }).budgetEstimate).toBe(5_000_000_000)
  })

  it('длинные поля обрезаются с многоточием', () => {
    const long = 'а'.repeat(600)
    const hit = hydrateInfovod({ ...RAW, summary: long })
    expect(hit.summary.length).toBe(500)
    expect(hit.summary.endsWith('…')).toBe(true)
  })

  it('слишком длинный заголовок обрезается до 220', () => {
    const hit = hydrateInfovod({ ...RAW, title: 'б'.repeat(400) })
    expect(hit.title.length).toBe(220)
  })

  it('заметки пользователя сохраняются только строкой', () => {
    expect(hydrateInfovod({ ...RAW, notes: 'мой комментарий' }).notes).toBe('мой комментарий')
    expect(hydrateInfovod({ ...RAW, notes: { a: 1 } }).notes).toBe('')
  })

  it('незнакомые поля источника сохраняются', () => {
    const hit = hydrateInfovod({ ...RAW, rawScore: 7, jobId: 'job-1' })
    expect(hit.rawScore).toBe(7)
    expect(hit.jobId).toBe('job-1')
  })

  it('пробелы в регионе и отрасли срезаются', () => {
    const hit = hydrateInfovod({ ...RAW, region: '  Тверская область  ', industry: ' Транспорт ' })
    expect(hit.region).toBe('Тверская область')
    expect(hit.industry).toBe('Транспорт')
  })

  it('привязка к проекту сохраняется', () => {
    expect(hydrateInfovod({ ...RAW, projectId: 'p-42' }).projectId).toBe('p-42')
  })
})

describe('mediaStatus', () => {
  it('без запуска мониторинг простаивает', () => {
    const status = mediaStatus()
    expect(status.running).toBe(false)
    expect(status.jobId).toBeNull()
  })
})
