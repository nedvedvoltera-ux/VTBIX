import { describe, expect, it } from 'vitest'

import {
  buildMasterInstructions,
  CONCESSION_TERM_ITEMS,
  matchConcessionTermId,
  normalizeTermRows,
  PROMPT_SECTIONS,
  termsSchemaObject,
} from '../../server/promptMaster.js'

describe('CONCESSION_TERM_ITEMS', () => {
  it('18 условий КС с уникальными id', () => {
    expect(CONCESSION_TERM_ITEMS).toHaveLength(18)
    const ids = CONCESSION_TERM_ITEMS.map((item) => item.id)
    expect(new Set(ids).size).toBe(18)
  })

  it('три поля финансового участия концедента вынесены в группу', () => {
    const grouped = CONCESSION_TERM_ITEMS.filter((item) => item.group === 'Финансовое участие Концедента')
    expect(grouped.map((item) => item.id)).toEqual(['capitalGrant', 'lostRevenue', 'violatorTravel'])
  })

  it('у каждого условия есть подпись', () => {
    for (const item of CONCESSION_TERM_ITEMS) {
      expect(item.label.trim().length).toBeGreaterThan(0)
    }
  })
})

describe('PROMPT_SECTIONS', () => {
  it('11 разделов записки с уникальными id', () => {
    expect(PROMPT_SECTIONS).toHaveLength(11)
    expect(new Set(PROMPT_SECTIONS.map((item) => item.id)).size).toBe(11)
  })
})

describe('termsSchemaObject', () => {
  it('ключи схемы совпадают с каталогом условий', () => {
    const schema = termsSchemaObject()
    expect(Object.keys(schema)).toEqual(CONCESSION_TERM_ITEMS.map((item) => item.id))
  })

  it('группа попадает в подсказку', () => {
    const schema = termsSchemaObject()
    expect(schema.capitalGrant).toContain('Финансовое участие Концедента: Капитальный грант')
    expect(schema.subject).not.toContain('Финансовое участие')
  })
})

describe('matchConcessionTermId', () => {
  it('находит по точному id', () => {
    expect(matchConcessionTermId('capitalGrant')).toBe('capitalGrant')
  })

  it('находит по подписи в любом регистре и с ё', () => {
    expect(matchConcessionTermId('Предмет соглашения')).toBe('subject')
    expect(matchConcessionTermId('ОБЪЕМ ИНВЕСТИЦИЙ В СОЗДАНИЕ ОБЪЕКТА')).toBe('investmentVolume')
  })

  it('находит по алиасу', () => {
    expect(matchConcessionTermId('концессионная плата')).toBe('concessionFee')
    expect(matchConcessionTermId('проектирование')).toBe('design')
  })

  it('находит длинный алиас как подстроку', () => {
    expect(matchConcessionTermId('Условие: компенсация при прекращении соглашения')).toBe('terminationCompensation')
  })

  it('короткий алиас подстрокой не срабатывает', () => {
    expect(matchConcessionTermId('объект недвижимости рядом')).toBeNull()
  })

  it('null на пустом и мусорном вводе', () => {
    expect(matchConcessionTermId('')).toBeNull()
    expect(matchConcessionTermId(null)).toBeNull()
    expect(matchConcessionTermId('   ---   ')).toBeNull()
    expect(matchConcessionTermId('неизвестное условие')).toBeNull()
  })
})

describe('normalizeTermRows', () => {
  it('всегда 18 строк в порядке каталога', () => {
    const rows = normalizeTermRows(null)
    expect(rows).toHaveLength(18)
    expect(rows.map((row) => row.id)).toEqual(CONCESSION_TERM_ITEMS.map((item) => item.id))
    expect(rows.every((row) => row.value === '')).toBe(true)
  })

  it('раскладывает плоский объект по ключам', () => {
    const rows = normalizeTermRows({ subject: 'Создание моста', term: '25 лет' })
    expect(rows.find((row) => row.id === 'subject').value).toBe('Создание моста')
    expect(rows.find((row) => row.id === 'term').value).toBe('25 лет')
    expect(rows.find((row) => row.id === 'object').value).toBe('')
  })

  it('принимает массив строк с label', () => {
    const rows = normalizeTermRows([
      { label: 'Капитальный грант', value: '3 млрд' },
      { id: 'design', value: 'ПИР за концессионером' },
    ])
    expect(rows.find((row) => row.id === 'capitalGrant').value).toBe('3 млрд')
    expect(rows.find((row) => row.id === 'design').value).toBe('ПИР за концессионером')
  })

  it('достаёт значение из вложенного объекта', () => {
    const rows = normalizeTermRows({ subject: { value: '  Мост  ' }, object: { text: 'Путепровод' } })
    expect(rows.find((row) => row.id === 'subject').value).toBe('Мост')
    expect(rows.find((row) => row.id === 'object').value).toBe('Путепровод')
  })

  it('числа и логические значения приводит к строке', () => {
    const rows = normalizeTermRows({ term: 25, directAgreement: true })
    expect(rows.find((row) => row.id === 'term').value).toBe('25')
    expect(rows.find((row) => row.id === 'directAgreement').value).toBe('true')
  })

  it('заходит во вложенную группу по имени ключа', () => {
    const rows = normalizeTermRows({ 'Финансовое участие': { capitalGrant: '1 млрд' } })
    expect(rows.find((row) => row.id === 'capitalGrant').value).toBe('1 млрд')
  })

  it('пустое значение не затирает уже найденное', () => {
    const rows = normalizeTermRows([
      { id: 'subject', value: 'Мост' },
      { id: 'subject', value: '' },
    ])
    expect(rows.find((row) => row.id === 'subject').value).toBe('Мост')
  })

  it('неизвестные ключи игнорируются', () => {
    const rows = normalizeTermRows({ чтотоневедомое: 'значение' })
    expect(rows.every((row) => row.value === '')).toBe(true)
  })
})

describe('buildMasterInstructions', () => {
  it('работает без аргументов и содержит каталог условий', () => {
    const text = buildMasterInstructions()
    expect(text).toContain('Старший финансовый аналитик')
    expect(text).toContain('- capitalGrant:')
    expect(text).toContain('русском')
  })

  it('раздел включён, пока его явно не выключили', () => {
    const all = buildMasterInstructions({ sections: {} })
    expect(all).toContain('Риски')

    const off = buildMasterInstructions({ sections: { risks: false } })
    expect(off).not.toContain('Риски — матрица')
  })

  it('английский язык и своя роль', () => {
    const text = buildMasterInstructions({ language: 'en', role: 'Кредитный аналитик.' })
    expect(text).toContain('на английском')
    expect(text).toContain('Ты — Кредитный аналитик.')
  })

  it('неизвестные тон, глубина и формат падают в значения по умолчанию', () => {
    const weird = buildMasterInstructions({ tone: 'xxx', depth: 'yyy', outputFormat: 'zzz' })
    const plain = buildMasterInstructions({ tone: 'formal', depth: 'standard', outputFormat: 'memo' })
    expect(weird).toBe(plain)
  })

  it('метрики выводятся с весами, иначе список по умолчанию', () => {
    const withMetrics = buildMasterInstructions({ metrics: [{ name: 'NPV', weight: 30 }, { name: 'DSCR' }] })
    expect(withMetrics).toContain('NPV — вес 30')
    expect(withMetrics).toContain('DSCR — вес 10')

    const without = buildMasterInstructions({ metrics: [] })
    expect(without).toContain('NPV, IRR, DPP, WACC, EBITDA margin, DSCR')
  })

  it('приоритет пояснений сотрудника переключается', () => {
    expect(buildMasterInstructions({ useEmployeeNotes: true })).toContain('имеют приоритет')
    expect(buildMasterInstructions({ useEmployeeNotes: false })).toContain('только как справочный контекст')
  })

  it('особые указания добавляются в конец', () => {
    const text = buildMasterInstructions({ extraInstructions: 'Проверить ЗУ' })
    expect(text).toContain('Особые указания:\nПроверить ЗУ')
  })

  it('нет пустых строк от отключённых блоков', () => {
    const text = buildMasterInstructions({})
    expect(text.split('\n').some((line) => line === '')).toBe(false)
  })
})
