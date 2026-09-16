import { describe, expect, it } from 'vitest'

import {
  extractFromUpload,
  formatBudget,
  formatBytes,
  formatDate,
  fromDatetimeLocal,
  toDatetimeLocal,
  uid,
} from '../../src/utils/format'
import { extractFromUpload as extractOnServer } from '../../server/llm.js'

describe('extractFromUpload', () => {
  it('нейтральные значения для неизвестного файла', () => {
    expect(extractFromUpload('x.pdf', '')).toEqual({
      name: 'Инвестиционный проект',
      industry: 'Строительство',
      country: 'Россия',
      region: 'Москва',
      budget: 5_000_000_000,
    })
  })

  it('отрасль по ключевым словам', () => {
    expect(extractFromUpload('teo.pdf', 'ТЭЦ').industry).toBe('Энергетика')
    expect(extractFromUpload('teo.pdf', 'портовый терминал').industry).toBe('Логистика')
    expect(extractFromUpload('teo.pdf', 'ЦОД').industry).toBe('IT и ЦОД')
  })

  it('сумма из текста перебивает шаблон', () => {
    expect(extractFromUpload('teo.pdf', '18 млрд').budget).toBe(18_000_000_000)
  })

  it('имя файла становится названием', () => {
    expect(extractFromUpload('Мост-через-Обь.pdf', '').name).toBe('Мост через Обь')
  })

  it('фронт и сервер разбирают одинаково', () => {
    const cases: [string, string][] = [
      ['teo.pdf', 'ТЭЦ в Казани, 12 млрд'],
      ['dc_project.pdf', 'дата-центр'],
      ['x.pdf', ''],
      ['Мост_через_Обь.pdf', 'порт во Владивостоке 1,5 млрд'],
      ['astana.pdf', 'проект в Астане'],
    ]
    for (const [fileName, notes] of cases) {
      expect(extractFromUpload(fileName, notes)).toEqual(extractOnServer(fileName, notes))
    }
  })
})

describe('formatBudget', () => {
  it('пустое значение', () => {
    expect(formatBudget(null)).toBe('—')
    expect(formatBudget(NaN)).toBe('—')
  })

  it('миллиарды с одним знаком после запятой', () => {
    expect(formatBudget(12_500_000_000)).toBe('12,5 млрд ₽')
    expect(formatBudget(1_000_000_000)).toBe('1 млрд ₽')
  })

  it('меньше миллиарда — в миллионах без дробей', () => {
    expect(formatBudget(850_000_000)).toBe('850 млн ₽')
    expect(formatBudget(999_000_000)).toBe('999 млн ₽')
  })

  it('ноль показывается в миллионах', () => {
    expect(formatBudget(0)).toBe('0 млн ₽')
  })
})

describe('formatBytes', () => {
  it('ноль и пусто', () => {
    expect(formatBytes(0)).toBe('—')
    expect(formatBytes(null)).toBe('—')
  })

  it('килобайты с минимумом единицы', () => {
    expect(formatBytes(1)).toBe('1 КБ')
    expect(formatBytes(2048)).toBe('2 КБ')
    expect(formatBytes(500_000)).toBe('488 КБ')
  })

  it('мегабайты с одним знаком', () => {
    expect(formatBytes(2 * 1024 * 1024)).toBe('2.0 МБ')
    expect(formatBytes(15 * 1024 * 1024 + 512 * 1024)).toBe('15.5 МБ')
  })
})

describe('formatDate', () => {
  it('показывает день, месяц и время', () => {
    const text = formatDate('2026-03-15T12:30:00.000Z')
    expect(text).toMatch(/\d{2}/)
    expect(text).toMatch(/:\d{2}/)
  })
})

describe('toDatetimeLocal и fromDatetimeLocal', () => {
  it('пустой ввод даёт пустую строку', () => {
    expect(toDatetimeLocal(undefined)).toBe('')
    expect(toDatetimeLocal('')).toBe('')
    expect(fromDatetimeLocal('')).toBe('')
  })

  it('битая дата даёт пустую строку', () => {
    expect(toDatetimeLocal('не дата')).toBe('')
    expect(fromDatetimeLocal('не дата')).toBe('')
  })

  it('формат подходит для input datetime-local', () => {
    expect(toDatetimeLocal('2026-03-15T12:30:00.000Z')).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
  })

  it('туда-обратно сохраняет минуту', () => {
    const iso = '2026-03-15T12:30:00.000Z'
    const back = fromDatetimeLocal(toDatetimeLocal(iso))
    expect(back).toBe(iso)
  })

  it('секунды отбрасываются', () => {
    const back = fromDatetimeLocal(toDatetimeLocal('2026-03-15T12:30:45.000Z'))
    expect(back).toBe('2026-03-15T12:30:00.000Z')
  })
})

describe('uid', () => {
  it('начинается с префикса', () => {
    expect(uid('deal').startsWith('deal-')).toBe(true)
    expect(uid().startsWith('p-')).toBe(true)
  })

  it('не повторяется на серии вызовов', () => {
    const ids = new Set(Array.from({ length: 500 }, () => uid('x')))
    expect(ids.size).toBe(500)
  })
})
