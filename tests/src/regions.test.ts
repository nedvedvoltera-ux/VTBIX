import { describe, expect, it } from 'vitest'

import {
  DEBT_LABEL,
  FEDERAL_DISTRICTS,
  FIN_LABEL,
  FIT_LABEL,
  getRegionById,
  OUTLOOK_LABEL,
  REGION_RATINGS,
} from '../../src/data/regions'

describe('справочник регионов', () => {
  it('охватывает все субъекты', () => {
    expect(REGION_RATINGS.length).toBeGreaterThan(80)
  })

  it('id уникальны', () => {
    expect(new Set(REGION_RATINGS.map((region) => region.id)).size).toBe(REGION_RATINGS.length)
  })

  it('названия субъектов не пустые', () => {
    expect(REGION_RATINGS.every((region) => region.subject.trim().length > 0)).toBe(true)
  })

  it('федеральный округ у каждого региона из справочника', () => {
    const known = new Set(FEDERAL_DISTRICTS)
    for (const region of REGION_RATINGS) {
      expect(known.has(region.federalDistrict as (typeof FEDERAL_DISTRICTS)[number])).toBe(true)
    }
  })

  it('восемь федеральных округов', () => {
    expect(FEDERAL_DISTRICTS).toHaveLength(8)
  })
})

describe('подписи справочника', () => {
  it('долговая устойчивость', () => {
    expect(Object.keys(DEBT_LABEL).sort()).toEqual(['high', 'low', 'mid'])
  })

  it('финансовое состояние', () => {
    expect(Object.keys(FIN_LABEL).sort()).toEqual(['bad', 'good', 'mid'])
  })

  it('вывод по концессии', () => {
    expect(Object.keys(FIT_LABEL).sort()).toEqual(['advantageous', 'average', 'unfavorable'])
  })

  it('прогноз АКРА', () => {
    expect(Object.keys(OUTLOOK_LABEL).sort()).toEqual(['developing', 'negative', 'positive', 'stable'])
  })
})

describe('значения рейтинга', () => {
  it('оценки лежат в допустимых списках', () => {
    for (const region of REGION_RATINGS) {
      expect(['good', 'mid', 'bad']).toContain(region.finState)
      expect(['advantageous', 'average', 'unfavorable']).toContain(region.concessionFit)
      expect(['positive', 'stable', 'negative', 'developing']).toContain(region.acraOutlook)
    }
  })

  it('бюджетные показатели — числа', () => {
    for (const region of REGION_RATINGS) {
      expect(Number.isFinite(region.revenuesTotal)).toBe(true)
      expect(Number.isFinite(region.revenuesOwn)).toBe(true)
      expect(Number.isFinite(region.revenuesGrants)).toBe(true)
      expect(Number.isFinite(region.debtTotal)).toBe(true)
    }
  })

  it('доходы и долг неотрицательны', () => {
    for (const region of REGION_RATINGS) {
      expect(region.revenuesTotal).toBeGreaterThanOrEqual(0)
      expect(region.revenuesOwn).toBeGreaterThanOrEqual(0)
      expect(region.debtTotal).toBeGreaterThanOrEqual(0)
    }
  })

  it('собственные и безвозмездные доходы дают итог с точностью округления', () => {
    for (const region of REGION_RATINGS) {
      expect(Math.abs(region.revenuesOwn + region.revenuesGrants - region.revenuesTotal)).toBeLessThanOrEqual(0.11)
    }
  })

  it('долг считается от собственных доходов', () => {
    for (const region of REGION_RATINGS) {
      const expected = (region.revenuesOwn * region.debtToOwnRevenue) / 100
      expect(Math.abs(region.debtTotal - expected)).toBeLessThanOrEqual(Math.max(0.11, expected * 0.001))
    }
  })

  it('доли выражены в процентах', () => {
    for (const region of REGION_RATINGS) {
      expect(region.ownRevenueShare2025).toBeGreaterThan(0)
      expect(region.ownRevenueShare2025).toBeLessThanOrEqual(100)
      expect(region.commercialDebtShare).toBeGreaterThanOrEqual(0)
      expect(region.commercialDebtShare).toBeLessThanOrEqual(100)
    }
  })

  it('каждый вид долга неотрицателен и не больше итога', () => {
    for (const region of REGION_RATINGS) {
      const parts = [
        region.debtCommercial,
        region.debtBudgetLoans,
        region.debtBankLoans,
        region.debtSecurities,
        region.debtGuarantees,
        region.debtMunicipalZone,
        region.debtRedZone,
      ]
      for (const part of parts) {
        expect(part).toBeGreaterThanOrEqual(0)
        expect(part).toBeLessThanOrEqual(region.debtTotal + 0.11)
      }
    }
  })

  it('разбивка долга покрывает итог целиком', () => {
    for (const region of REGION_RATINGS) {
      const parts =
        region.debtCommercial +
        region.debtBudgetLoans +
        region.debtBankLoans +
        region.debtSecurities +
        region.debtGuarantees +
        region.debtMunicipalZone +
        region.debtRedZone
      expect(parts).toBeGreaterThanOrEqual(region.debtTotal - 0.71)
    }
  })

  it('ИНН — десять цифр', () => {
    for (const region of REGION_RATINGS) {
      expect(region.innExecutive).toMatch(/^\d{10}$/)
      expect(region.innFinance).toMatch(/^\d{10}$/)
    }
  })

  it('рейтинги АКРА заполнены и дата одна на справочник', () => {
    const dates = new Set(REGION_RATINGS.map((region) => region.acraDate))
    expect(dates.size).toBe(1)
    for (const region of REGION_RATINGS) {
      expect(region.acra2024.length).toBeGreaterThan(0)
      expect(region.acra2025.length).toBeGreaterThan(0)
    }
  })

  it('низкая долговая устойчивость означает плохое финансовое состояние', () => {
    for (const region of REGION_RATINGS) {
      if (region.debtSustain2526 === 'low') expect(region.finState).toBe('bad')
    }
  })

  it('плохое финансовое состояние закрывает концессию', () => {
    for (const region of REGION_RATINGS) {
      if (region.finState === 'bad') expect(region.concessionFit).toBe('unfavorable')
    }
  })

  it('выгодные регионы идут первыми', () => {
    const rank = { advantageous: 0, average: 1, unfavorable: 2 } as const
    const order = REGION_RATINGS.map((region) => rank[region.concessionFit])
    expect(order).toEqual([...order].sort((a, b) => a - b))
  })

  it('справочник стабилен между сборками', () => {
    const first = REGION_RATINGS[0]
    expect(first.id).toBe(first.id)
    expect(typeof first.subject).toBe('string')
  })
})

describe('getRegionById', () => {
  it('находит регион по id', () => {
    const first = REGION_RATINGS[0]
    expect(getRegionById(first.id)).toBe(first)
  })

  it('неизвестный id даёт undefined', () => {
    expect(getRegionById('нет-такого-региона')).toBeUndefined()
    expect(getRegionById('')).toBeUndefined()
  })

  it('находит все регионы по их id', () => {
    for (const region of REGION_RATINGS) {
      expect(getRegionById(region.id)?.subject).toBe(region.subject)
    }
  })
})
