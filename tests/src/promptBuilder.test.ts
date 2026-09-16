import { describe, expect, it } from 'vitest'

import { buildPromptPreview } from '../../src/utils/promptBuilder'
import { DEFAULT_PROMPT, PROMPT_SECTIONS } from '../../src/data/mock'
import type { Project, PromptConfig } from '../../src/types'

function config(extra: Partial<PromptConfig> = {}): PromptConfig {
  return { ...DEFAULT_PROMPT, ...extra }
}

describe('buildPromptPreview', () => {
  it('содержит роль, язык и задачу', () => {
    const text = buildPromptPreview(config())
    expect(text).toContain('Ты — Старший финансовый аналитик')
    expect(text).toContain('на русском языке')
    expect(text).toContain('Задача: подготовить аналитическую записку')
  })

  it('английский язык', () => {
    expect(buildPromptPreview(config({ language: 'en' }))).toContain('на английском языке')
  })

  it('включённые разделы нумеруются по порядку', () => {
    const text = buildPromptPreview(config({ sections: { ...DEFAULT_PROMPT.sections, esg: false, comparables: false } }))
    expect(text).toContain('1. Резюме для руководства')
    expect(text).not.toContain('ESG и комплаенс —')
  })

  it('выключенные разделы не попадают в промпт', () => {
    const off = Object.fromEntries(PROMPT_SECTIONS.map((section) => [section.id, false])) as PromptConfig['sections']
    const text = buildPromptPreview(config({ sections: off }))
    expect(text).not.toContain('1. Резюме для руководства')
    expect(text).toContain('Обязательные разделы:')
  })

  it('метрики выводятся с весами', () => {
    const text = buildPromptPreview(config({ metrics: [{ name: 'NPV', weight: 30 }, { name: 'DSCR', weight: 20 }] }))
    expect(text).toContain('NPV — вес 30, DSCR — вес 20')
  })

  it('без метрик пишет «не заданы»', () => {
    expect(buildPromptPreview(config({ metrics: [] }))).toContain('не заданы')
  })

  it('светофор и связный текст рекомендации переключаются', () => {
    expect(buildPromptPreview(config({ recommendationStyle: 'traffic' }))).toContain('один из трёх статусов')
    expect(buildPromptPreview(config({ recommendationStyle: 'narrative' }))).toContain('связный абзац')
  })

  it('приоритет пояснений сотрудника переключается', () => {
    expect(buildPromptPreview(config({ useEmployeeNotes: true }))).toContain('имеют приоритет')
    expect(buildPromptPreview(config({ useEmployeeNotes: false }))).toContain('только как справочный контекст')
  })

  it('дополнительные блоки добавляются', () => {
    const text = buildPromptPreview(config({ includeComparables: true, includeEsg: true }))
    expect(text).toContain('сравнения с отраслевыми аналогами')
    expect(text).toContain('ESG и санкционный контур')
  })

  it('без дополнительных блоков строки нет', () => {
    expect(buildPromptPreview(config({ includeComparables: false, includeEsg: false }))).not.toContain('Дополнительно:')
  })

  it('карточка КС описана с порядком ключей', () => {
    const text = buildPromptPreview(config())
    expect(text).toContain('сначала terms')
    expect(text).toContain('directAgreement')
    expect(text).toContain('баланс рисков')
  })

  it('особые указания попадают в промпт', () => {
    expect(buildPromptPreview(config({ extraInstructions: 'Проверить ЗУ' }))).toContain('Особые указания:\nПроверить ЗУ')
  })

  it('пустых строк в промпте нет', () => {
    expect(buildPromptPreview(config()).split('\n').includes('')).toBe(false)
  })

  it('без примера объекта блока вложения нет', () => {
    expect(buildPromptPreview(config())).not.toContain('вложение (пример объекта)')
  })

  it('пример объекта добавляет карточку с полями', () => {
    const sample = {
      id: 'p1',
      name: 'Мост через Обь',
      industry: 'Транспорт',
      country: 'Россия',
      region: 'Новосибирская область',
      budget: 12_500_000_000,
      fileName: 'teo.pdf',
      notes: 'Смотреть ЗУ',
      status: 'ready',
    } as Project
    const text = buildPromptPreview(config(), sample)
    expect(text).toContain('Название: Мост через Обь')
    expect(text).toContain('Локация: Россия, Новосибирская область')
    expect(text).toContain('Бюджет: 12,5 млрд ₽')
    expect(text).toContain('Файл: teo.pdf')
    expect(text).toContain('Пояснения сотрудника: Смотреть ЗУ')
  })

  it('пустые поля примера подписаны заглушками', () => {
    const sample = { id: 'p2', name: 'Без данных', status: 'draft', budget: null, fileName: null } as unknown as Project
    const text = buildPromptPreview(config(), sample)
    expect(text).toContain('Отрасль: не извлечена')
    expect(text).toContain('Локация: не извлечена')
    expect(text).toContain('Бюджет: —')
    expect(text).toContain('Файл: не загружен')
    expect(text).toContain('Пояснения сотрудника: нет')
  })
})
