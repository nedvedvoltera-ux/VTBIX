import { describe, expect, it } from 'vitest'

import { hydrateDeal } from '../../server/crm.js'

describe('hydrateDeal', () => {
  it('мусор на входе даёт null', () => {
    expect(hydrateDeal(null)).toBeNull()
    expect(hydrateDeal('строка')).toBeNull()
  })

  it('пустая сделка получает значения по умолчанию', () => {
    const deal = hydrateDeal({ id: 'd1' })
    expect(deal.name).toBe('Без названия')
    expect(deal.stage).toBe('lead')
    expect(deal.sourceType).toBe('project')
    expect(deal.owner).toBe('Вы')
    expect(deal.budget).toBeNull()
    expect(deal.contacts).toEqual([])
    expect(deal.activities).toEqual([])
    expect(deal.plans).toEqual([])
    expect(deal.nextTouchAt).toBeNull()
  })

  it('этап воронки приводится к списку', () => {
    expect(hydrateDeal({ id: 'd1', stage: 'negotiation' }).stage).toBe('negotiation')
    expect(hydrateDeal({ id: 'd1', stage: 'won' }).stage).toBe('won')
    expect(hydrateDeal({ id: 'd1', stage: 'придумано' }).stage).toBe('lead')
  })

  it('источник — инфоповод только при точном значении', () => {
    expect(hydrateDeal({ id: 'd1', sourceType: 'infovod' }).sourceType).toBe('infovod')
    expect(hydrateDeal({ id: 'd1', sourceType: 'media' }).sourceType).toBe('project')
  })

  it('бюджет: пустое и ноль превращаются в null', () => {
    expect(hydrateDeal({ id: 'd1', budget: 12_000_000_000 }).budget).toBe(12_000_000_000)
    expect(hydrateDeal({ id: 'd1', budget: '' }).budget).toBeNull()
    expect(hydrateDeal({ id: 'd1', budget: null }).budget).toBeNull()
    expect(hydrateDeal({ id: 'd1', budget: 0 }).budget).toBeNull()
    expect(hydrateDeal({ id: 'd1', budget: 'много' }).budget).toBeNull()
  })

  it('длинные поля обрезаются', () => {
    const deal = hydrateDeal({ id: 'd1', name: 'н'.repeat(300), region: 'р'.repeat(200), notes: 'з'.repeat(5000) })
    expect(deal.name.length).toBe(180)
    expect(deal.region.length).toBe(120)
    expect(deal.notes.length).toBe(4000)
  })

  it('контакт без имени отбрасывается', () => {
    const deal = hydrateDeal({
      id: 'd1',
      contacts: [{ name: 'Павел Ким', role: 'Концедент' }, { role: 'без имени' }, null],
    })
    expect(deal.contacts).toHaveLength(1)
    expect(deal.contacts[0].name).toBe('Павел Ким')
    expect(deal.contacts[0].isPrimary).toBe(false)
  })

  it('касание без темы и текста отбрасывается', () => {
    const deal = hydrateDeal({
      id: 'd1',
      activities: [{ title: 'Звонок', happenedAt: '2026-01-10T10:00:00.000Z' }, {}, { body: 'только текст', happenedAt: '2026-01-09T10:00:00.000Z' }],
    })
    expect(deal.activities).toHaveLength(2)
  })

  it('касания идут от новых к старым', () => {
    const deal = hydrateDeal({
      id: 'd1',
      activities: [
        { title: 'Старое', happenedAt: '2026-01-01T10:00:00.000Z' },
        { title: 'Новое', happenedAt: '2026-03-01T10:00:00.000Z' },
        { title: 'Среднее', happenedAt: '2026-02-01T10:00:00.000Z' },
      ],
    })
    expect(deal.activities.map((item) => item.title)).toEqual(['Новое', 'Среднее', 'Старое'])
  })

  it('вид касания приводится к списку', () => {
    const deal = hydrateDeal({
      id: 'd1',
      activities: [
        { title: 'A', kind: 'call', happenedAt: '2026-01-02T10:00:00.000Z' },
        { title: 'B', kind: 'телепатия', happenedAt: '2026-01-01T10:00:00.000Z' },
      ],
    })
    expect(deal.activities[0].kind).toBe('call')
    expect(deal.activities[1].kind).toBe('note')
  })

  it('автор касания по умолчанию — Вы', () => {
    const deal = hydrateDeal({ id: 'd1', activities: [{ title: 'Звонок' }] })
    expect(deal.activities[0].author).toBe('Вы')
  })

  it('план без темы отбрасывается', () => {
    const deal = hydrateDeal({ id: 'd1', plans: [{ title: 'Созвон', dueAt: '2026-04-01T10:00:00.000Z' }, { body: 'без темы' }] })
    expect(deal.plans).toHaveLength(1)
  })

  it('планы идут по сроку от ближайшего', () => {
    const deal = hydrateDeal({
      id: 'd1',
      plans: [
        { title: 'Позже', dueAt: '2026-05-01T10:00:00.000Z' },
        { title: 'Раньше', dueAt: '2026-04-01T10:00:00.000Z' },
      ],
    })
    expect(deal.plans.map((item) => item.title)).toEqual(['Раньше', 'Позже'])
  })

  it('следующее касание — ближайший открытый план', () => {
    const deal = hydrateDeal({
      id: 'd1',
      plans: [
        { title: 'Готово', dueAt: '2026-03-01T10:00:00.000Z', status: 'done' },
        { title: 'Открыто позже', dueAt: '2026-05-01T10:00:00.000Z', status: 'open' },
        { title: 'Открыто раньше', dueAt: '2026-04-01T10:00:00.000Z', status: 'open' },
      ],
    })
    expect(deal.nextTouchAt).toBe('2026-04-01T10:00:00.000Z')
  })

  it('без открытых планов со сроком следующего касания нет', () => {
    const deal = hydrateDeal({
      id: 'd1',
      plans: [{ title: 'Готово', dueAt: '2026-03-01T10:00:00.000Z', status: 'done' }, { title: 'Без срока' }],
    })
    expect(deal.nextTouchAt).toBeNull()
  })

  it('статус плана приводится к списку', () => {
    const deal = hydrateDeal({
      id: 'd1',
      plans: [{ title: 'A', status: 'cancelled' }, { title: 'B', status: 'придумано' }],
    })
    const byTitle = Object.fromEntries(deal.plans.map((item) => [item.title, item.status]))
    expect(byTitle.A).toBe('cancelled')
    expect(byTitle.B).toBe('open')
  })

  it('связи с проектом и инфоповодом сохраняются', () => {
    const deal = hydrateDeal({ id: 'd1', projectId: 'p-1', infovodId: 'h-1' })
    expect(deal.projectId).toBe('p-1')
    expect(deal.infovodId).toBe('h-1')
  })

  it('повторная нормализация не меняет результат', () => {
    const raw = {
      id: 'd1',
      name: 'Мост',
      stage: 'offer',
      budget: 5_000_000_000,
      contacts: [{ id: 'c1', name: 'Павел Ким' }],
      activities: [{ id: 'a1', title: 'Звонок', happenedAt: '2026-01-10T10:00:00.000Z', createdAt: '2026-01-10T10:00:00.000Z' }],
      plans: [{ id: 'n1', title: 'Созвон', dueAt: '2026-04-01T10:00:00.000Z', createdAt: '2026-01-10T10:00:00.000Z' }],
      createdAt: '2026-01-01T10:00:00.000Z',
      updatedAt: '2026-01-11T10:00:00.000Z',
    }
    expect(hydrateDeal(hydrateDeal(raw))).toEqual(hydrateDeal(raw))
  })
})
