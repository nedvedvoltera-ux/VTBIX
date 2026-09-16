import { describe, expect, it } from 'vitest'

import {
  CONCESSION_TERM_ITEMS,
  displayConcessionTerms,
  emptyConcessionTerms,
  matchConcessionTermId,
} from '../../src/data/ksTerms'
import {
  CONCESSION_TERM_ITEMS as SERVER_TERM_ITEMS,
  matchConcessionTermId as matchOnServer,
} from '../../server/promptMaster.js'

describe('каталог условий КС', () => {
  it('18 условий с уникальными id', () => {
    expect(CONCESSION_TERM_ITEMS).toHaveLength(18)
    expect(new Set(CONCESSION_TERM_ITEMS.map((item) => item.id)).size).toBe(18)
  })

  it('совпадает с серверным каталогом по id и подписям', () => {
    expect(CONCESSION_TERM_ITEMS.map((item) => item.id)).toEqual(SERVER_TERM_ITEMS.map((item) => item.id))
    expect(CONCESSION_TERM_ITEMS.map((item) => item.label)).toEqual(SERVER_TERM_ITEMS.map((item) => item.label))
  })
})

describe('matchConcessionTermId', () => {
  it('находит по id', () => {
    expect(matchConcessionTermId('capitalGrant')).toBe('capitalGrant')
  })

  it('находит по подписи', () => {
    expect(matchConcessionTermId('Земельные участки')).toBe('landPlots')
    expect(matchConcessionTermId('прямое соглашение')).toBe('directAgreement')
  })

  it('находит по короткому алиасу интерфейса', () => {
    expect(matchConcessionTermId('срок')).toBe('term')
    expect(matchConcessionTermId('капекс')).toBe('investmentVolume')
    expect(matchConcessionTermId('ЗУ')).toBe('landPlots')
    expect(matchConcessionTermId('ПИР')).toBe('design')
  })

  it('null на пустом и неизвестном', () => {
    expect(matchConcessionTermId('')).toBeNull()
    expect(matchConcessionTermId('!!!')).toBeNull()
    expect(matchConcessionTermId('неизвестное условие')).toBeNull()
  })

  it('на id и подписях фронт и сервер согласны', () => {
    for (const item of CONCESSION_TERM_ITEMS) {
      expect(matchConcessionTermId(item.id)).toBe(matchOnServer(item.id))
      expect(matchConcessionTermId(item.label)).toBe(matchOnServer(item.label))
    }
  })

  it('интерфейс знает больше сокращений, чем сервер', () => {
    expect(matchConcessionTermId('срок')).toBe('term')
    expect(matchOnServer('срок')).toBeNull()
  })
})

describe('emptyConcessionTerms', () => {
  it('18 пустых строк в порядке каталога', () => {
    const rows = emptyConcessionTerms()
    expect(rows).toHaveLength(18)
    expect(rows.map((row) => row.id)).toEqual(CONCESSION_TERM_ITEMS.map((item) => item.id))
    expect(rows.every((row) => row.value === '')).toBe(true)
  })

  it('группа финансового участия сохраняется', () => {
    const grant = emptyConcessionTerms().find((row) => row.id === 'capitalGrant')
    expect(grant?.group).toBe('Финансовое участие Концедента')
  })
})

describe('displayConcessionTerms', () => {
  it('без данных даёт пустую карточку', () => {
    expect(displayConcessionTerms()).toEqual(emptyConcessionTerms())
    expect(displayConcessionTerms([])).toEqual(emptyConcessionTerms())
  })

  it('раскладывает значения по id', () => {
    const rows = displayConcessionTerms([{ id: 'subject', value: 'Создание моста' }])
    expect(rows.find((row) => row.id === 'subject')?.value).toBe('Создание моста')
    expect(rows.filter((row) => row.value !== '')).toHaveLength(1)
  })

  it('раскладывает значения по подписи, если id не узнан', () => {
    const rows = displayConcessionTerms([{ id: 'что-то своё', label: 'Концессионная плата', value: '1 руб.' }])
    expect(rows.find((row) => row.id === 'concessionFee')?.value).toBe('1 руб.')
  })

  it('неизвестные строки отбрасываются', () => {
    const rows = displayConcessionTerms([{ id: 'ниочём', label: 'тоже ниочём', value: 'потеряется' }])
    expect(rows.every((row) => row.value === '')).toBe(true)
  })

  it('порядок всегда как в каталоге', () => {
    const rows = displayConcessionTerms([
      { id: 'directAgreement', value: 'есть' },
      { id: 'subject', value: 'мост' },
    ])
    expect(rows.map((row) => row.id)).toEqual(CONCESSION_TERM_ITEMS.map((item) => item.id))
  })

  it('последнее значение по одному условию побеждает', () => {
    const rows = displayConcessionTerms([
      { id: 'subject', value: 'первое' },
      { id: 'subject', value: 'второе' },
    ])
    expect(rows.find((row) => row.id === 'subject')?.value).toBe('второе')
  })
})
