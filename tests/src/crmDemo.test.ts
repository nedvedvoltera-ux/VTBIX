// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'

import {
  CRM_DEMO_DEALS,
  getCrmDemoDeal,
  isCrmDemoId,
  readCrmDemo,
  stageCounts,
  writeCrmDemo,
} from '../../src/data/crmDemo'
import { CRM_STAGES } from '../../src/data/mock'
import type { CrmDeal, CrmStage } from '../../src/types'

describe('демо-сделки', () => {
  it('набор не пустой и у всех id с префиксом demo-', () => {
    expect(CRM_DEMO_DEALS.length).toBeGreaterThan(0)
    expect(CRM_DEMO_DEALS.every((deal) => deal.id.startsWith('demo-'))).toBe(true)
  })

  it('id уникальны', () => {
    expect(new Set(CRM_DEMO_DEALS.map((deal) => deal.id)).size).toBe(CRM_DEMO_DEALS.length)
  })

  it('этапы сделок только из справочника воронки', () => {
    const known = new Set(CRM_STAGES.map((stage) => stage.id))
    for (const deal of CRM_DEMO_DEALS) {
      expect(known.has(deal.stage)).toBe(true)
    }
  })

  it('воронка заполнена в несколько стадий, чтобы демо выглядело живым', () => {
    expect(new Set(CRM_DEMO_DEALS.map((deal) => deal.stage)).size).toBeGreaterThan(3)
  })

  it('есть поводы и из проектов, и из инфоповодов', () => {
    const sources = new Set(CRM_DEMO_DEALS.map((deal) => deal.sourceType))
    expect(sources.has('project')).toBe(true)
    expect(sources.has('infovod')).toBe(true)
  })
})

describe('isCrmDemoId', () => {
  it('узнаёт демо-сделку', () => {
    expect(isCrmDemoId('demo-lead-campus')).toBe(true)
  })

  it('обычные и пустые id не демо', () => {
    expect(isCrmDemoId('d-123')).toBe(false)
    expect(isCrmDemoId('')).toBe(false)
    expect(isCrmDemoId(undefined)).toBe(false)
  })
})

describe('getCrmDemoDeal', () => {
  it('находит сделку по id', () => {
    const first = CRM_DEMO_DEALS[0]
    expect(getCrmDemoDeal(first.id)).toBe(first)
  })

  it('неизвестный и пустой id дают null', () => {
    expect(getCrmDemoDeal('demo-нет-такой')).toBeNull()
    expect(getCrmDemoDeal(undefined)).toBeNull()
  })
})

describe('переключатель демо-режима', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('по умолчанию демо выключено', () => {
    expect(readCrmDemo()).toBe(false)
  })

  it('включение сохраняется', () => {
    writeCrmDemo(true)
    expect(readCrmDemo()).toBe(true)
  })

  it('выключение сохраняется', () => {
    writeCrmDemo(true)
    writeCrmDemo(false)
    expect(readCrmDemo()).toBe(false)
  })

  it('хранит флаг под своим ключом', () => {
    writeCrmDemo(true)
    expect(localStorage.getItem('vtbih.crmDemo')).toBe('1')
  })

  it('чужое значение в хранилище читается как выключено', () => {
    localStorage.setItem('vtbih.crmDemo', 'да')
    expect(readCrmDemo()).toBe(false)
  })
})

describe('stageCounts', () => {
  const stages = CRM_STAGES.slice(0, 3) as readonly { id: CrmStage; label: string }[]

  function deal(stage: CrmStage): CrmDeal {
    return { id: `d-${stage}-${Math.random()}`, stage } as CrmDeal
  }

  it('пустая воронка не делит на ноль', () => {
    const rows = stageCounts([], stages)
    expect(rows).toHaveLength(3)
    expect(rows.every((row) => row.count === 0 && row.share === 0)).toBe(true)
  })

  it('считает сделки по стадиям', () => {
    const rows = stageCounts([deal('lead'), deal('lead'), deal('meeting')], stages)
    const byId = Object.fromEntries(rows.map((row) => [row.id, row.count]))
    expect(byId.lead).toBe(2)
    expect(byId.contact).toBe(0)
    expect(byId.meeting).toBe(1)
  })

  it('считает долю в процентах', () => {
    const rows = stageCounts([deal('lead'), deal('lead'), deal('lead'), deal('meeting')], stages)
    const byId = Object.fromEntries(rows.map((row) => [row.id, row.share]))
    expect(byId.lead).toBe(75)
    expect(byId.meeting).toBe(25)
  })

  it('стадии без сделок остаются в воронке', () => {
    expect(stageCounts([deal('lead')], stages).map((row) => row.id)).toEqual(stages.map((stage) => stage.id))
  })

  it('подписи стадий сохраняются', () => {
    const rows = stageCounts([], stages)
    expect(rows.map((row) => row.label)).toEqual(stages.map((stage) => stage.label))
  })

  it('сделки вне переданных стадий не считаются', () => {
    const rows = stageCounts([deal('won')], stages)
    expect(rows.every((row) => row.count === 0)).toBe(true)
  })

  it('на демо-наборе сумма по всем стадиям равна числу сделок', () => {
    const rows = stageCounts(CRM_DEMO_DEALS, CRM_STAGES as readonly { id: CrmStage; label: string }[])
    const total = rows.reduce((sum, row) => sum + row.count, 0)
    expect(total).toBe(CRM_DEMO_DEALS.length)
  })
})
