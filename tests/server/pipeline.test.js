import { describe, expect, it } from 'vitest'

import { abortPipeline, mergeProjectProgress, runningPipelines } from '../../server/pipeline.js'

const PROMPT = { metrics: [{ name: 'NPV', weight: 1 }] }

function project(extra = {}) {
  return { id: 'p1', name: 'Мост', status: 'processing', documents: [], ...extra }
}

describe('mergeProjectProgress', () => {
  it('промежуточный этап оставляет проект в работе', () => {
    const next = mergeProjectProgress(project(), { stage: 'converting', progress: 30, message: 'Docling' }, PROMPT)
    expect(next.status).toBe('processing')
    expect(next.pipelineStage).toBe('converting')
    expect(next.progress).toBe(30)
    expect(next.pipelineMessage).toBe('Docling')
  })

  it('ошибка переводит проект в статус error', () => {
    const next = mergeProjectProgress(project(), { stage: 'error', message: 'LLM недоступен' }, PROMPT)
    expect(next.status).toBe('error')
    expect(next.pipelineMessage).toBe('LLM недоступен')
  })

  it('готовое извлечение даёт статус ready и применяет данные', () => {
    const next = mergeProjectProgress(
      project({ name: '' }),
      { stage: 'done', extracted: { name: 'Мост через Обь', industry: 'Транспорт' } },
      PROMPT,
    )
    expect(next.status).toBe('ready')
    expect(next.name).toBe('Мост через Обь')
    expect(next.industry).toBe('Транспорт')
    expect(next.extractedByLlm).toBe(true)
  })

  it('ранжирование считается по весам метрик', () => {
    const next = mergeProjectProgress(
      project(),
      { stage: 'done', extracted: { note: { financials: [{ metric: 'NPV', score: 84 }] } } },
      PROMPT,
    )
    expect(next.concessionScore).toBe(84)
    expect(next.concessionFit).toBe('advantageous')
  })

  it('только конвертация без разбора оставляет черновик', () => {
    const next = mergeProjectProgress(project(), { stage: 'done', extract: false, markdownReady: true }, PROMPT)
    expect(next.status).toBe('draft')
    expect(next.pipelineStage).toBeUndefined()
    expect(next.extractedByLlm).toBeUndefined()
  })

  it('повторная конвертация уже разобранного проекта сохраняет ready', () => {
    const next = mergeProjectProgress(project({ extractedByLlm: true }), { stage: 'done', extract: false }, PROMPT)
    expect(next.status).toBe('ready')
  })

  it('при extract=false данные разбора игнорируются', () => {
    const next = mergeProjectProgress(project(), { stage: 'done', extract: false, extracted: { industry: 'Транспорт' } }, PROMPT)
    expect(next.industry).toBeUndefined()
  })

  it('документ из события попадает в список и сводку', () => {
    const next = mergeProjectProgress(
      project(),
      { stage: 'converting', document: { id: 'd1', fileName: 'teo.pdf', fileSize: 2048, markdownReady: true, markdownChars: 900 } },
      PROMPT,
    )
    expect(next.documents).toHaveLength(1)
    expect(next.fileName).toBe('teo.pdf')
    expect(next.markdownReady).toBe(true)
    expect(next.markdownChars).toBe(900)
  })

  it('повторное событие по тому же документу обновляет его, а не дублирует', () => {
    const first = mergeProjectProgress(project(), { stage: 'converting', document: { id: 'd1', fileName: 'teo.pdf' } }, PROMPT)
    const second = mergeProjectProgress(first, { stage: 'converting', document: { id: 'd1', markdownReady: true } }, PROMPT)
    expect(second.documents).toHaveLength(1)
    expect(second.documents[0].fileName).toBe('teo.pdf')
    expect(second.documents[0].markdownReady).toBe(true)
  })

  it('данные о markdown из события важнее сводки', () => {
    const next = mergeProjectProgress(project(), { stage: 'extracting', markdownPreview: 'из события', markdownChars: 42 }, PROMPT)
    expect(next.markdownPreview).toBe('из события')
    expect(next.markdownChars).toBe(42)
  })

  it('не мутирует исходный проект', () => {
    const source = project()
    mergeProjectProgress(source, { stage: 'done', extracted: { industry: 'Транспорт' } }, PROMPT)
    expect(source.industry).toBeUndefined()
    expect(source.status).toBe('processing')
  })
})

describe('abortPipeline', () => {
  it('снимает проект из списка активных', () => {
    runningPipelines.add('p-abort')
    abortPipeline('p-abort')
    expect(runningPipelines.has('p-abort')).toBe(false)
  })

  it('отмена неизвестного проекта безопасна', () => {
    expect(() => abortPipeline('p-none')).not.toThrow()
  })
})
