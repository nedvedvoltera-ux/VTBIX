import { describe, expect, it } from 'vitest'

import {
  applyRanking,
  clampScore,
  computeRanking,
  DEFAULT_METRIC_WEIGHT,
  deriveConcession,
  fitFromScore,
  formatBln,
  formatPct,
  hydratePrompt,
  metricKey,
  metricsMatch,
  normalizeMetrics,
  slugify,
} from '../../src/utils/concession'
import { DEFAULT_PROMPT } from '../../src/data/mock'
import type { Project } from '../../src/types'

function readyProject(extra: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    name: 'Мост',
    status: 'ready',
    extractedByLlm: true,
    ...extra,
  } as Project
}

describe('clampScore', () => {
  it('зажимает в 0–100', () => {
    expect(clampScore(-10)).toBe(0)
    expect(clampScore(150)).toBe(100)
    expect(clampScore(50)).toBe(50)
  })

  it('округляет', () => {
    expect(clampScore(71.4)).toBe(71)
    expect(clampScore(71.5)).toBe(72)
  })

  it('нечисло превращает в ноль', () => {
    expect(clampScore(NaN)).toBe(0)
    expect(clampScore(Infinity)).toBe(0)
  })
})

describe('metricKey и metricsMatch', () => {
  it('ключ метрики сворачивает регистр, пробелы и ё', () => {
    expect(metricKey('EBITDA margin')).toBe('ebitdamargin')
    expect(metricKey('Срок окупаемости')).toBe('срококупаемости')
    expect(metricKey('Ёмкость')).toBe('емкость')
  })

  it('одинаковые метрики совпадают в любом написании', () => {
    expect(metricsMatch('NPV', 'npv')).toBe(true)
    expect(metricsMatch('EBITDA margin', 'ebitda_margin')).toBe(true)
  })

  it('совпадение по подстроке в обе стороны', () => {
    expect(metricsMatch('NPV', 'NPV проекта')).toBe(true)
    expect(metricsMatch('IRR проекта', 'IRR')).toBe(true)
  })

  it('разные метрики не совпадают', () => {
    expect(metricsMatch('NPV', 'IRR')).toBe(false)
  })

  it('пустые названия не совпадают', () => {
    expect(metricsMatch('', 'NPV')).toBe(false)
    expect(metricsMatch('---', 'NPV')).toBe(false)
  })
})

describe('fitFromScore', () => {
  it('пороги 78 и 58', () => {
    expect(fitFromScore(78)).toBe('advantageous')
    expect(fitFromScore(77)).toBe('average')
    expect(fitFromScore(58)).toBe('average')
    expect(fitFromScore(57)).toBe('unfavorable')
  })
})

describe('deriveConcession', () => {
  it('без данных ничего не выводит', () => {
    expect(deriveConcession(undefined, undefined)).toEqual({})
  })

  it('балл важнее рекомендации', () => {
    expect(deriveConcession(90, 'reject')).toEqual({ concessionScore: 90, concessionFit: 'advantageous' })
  })

  it('по рекомендации подставляет типовой балл', () => {
    expect(deriveConcession(undefined, 'invest')).toEqual({ concessionScore: 82, concessionFit: 'advantageous' })
    expect(deriveConcession(undefined, 'revise')).toEqual({ concessionScore: 64, concessionFit: 'average' })
    expect(deriveConcession(undefined, 'reject')).toEqual({ concessionScore: 42, concessionFit: 'unfavorable' })
  })
})

describe('normalizeMetrics', () => {
  it('не массив даёт пустой список', () => {
    expect(normalizeMetrics(null)).toEqual([])
    expect(normalizeMetrics('NPV')).toEqual([])
  })

  it('строки превращаются в метрики с типовым весом', () => {
    expect(normalizeMetrics(['NPV', 'DSCR'])).toEqual([
      { name: 'NPV', weight: 25 },
      { name: 'DSCR', weight: 10 },
    ])
  })

  it('неизвестная метрика получает вес по умолчанию', () => {
    expect(normalizeMetrics(['Своя метрика'])).toEqual([{ name: 'Своя метрика', weight: DEFAULT_METRIC_WEIGHT }])
  })

  it('явный вес уважается и зажимается', () => {
    expect(normalizeMetrics([{ name: 'NPV', weight: 40 }])[0].weight).toBe(40)
    expect(normalizeMetrics([{ name: 'NPV', weight: 500 }])[0].weight).toBe(100)
    expect(normalizeMetrics([{ name: 'NPV', weight: -5 }])[0].weight).toBe(0)
  })

  it('дубли по смыслу отбрасываются', () => {
    const list = normalizeMetrics(['NPV', 'npv', { name: 'N P V', weight: 50 }])
    expect(list).toHaveLength(1)
    expect(list[0].name).toBe('NPV')
  })

  it('пустые названия отбрасываются', () => {
    expect(normalizeMetrics(['', '   ', { name: '' }])).toEqual([])
  })

  it('пробелы вокруг названия срезаются', () => {
    expect(normalizeMetrics(['  IRR  '])[0].name).toBe('IRR')
  })
})

describe('hydratePrompt', () => {
  it('пустой промпт берёт все значения из основы', () => {
    expect(hydratePrompt(null, DEFAULT_PROMPT)).toEqual(DEFAULT_PROMPT)
  })

  it('без метрик сохраняет метрики основы', () => {
    const next = hydratePrompt({ role: 'Своя роль' }, DEFAULT_PROMPT)
    expect(next.role).toBe('Своя роль')
    expect(next.metrics).toEqual(DEFAULT_PROMPT.metrics)
  })

  it('свои метрики нормализуются', () => {
    const next = hydratePrompt({ metrics: ['NPV', 'NPV'] as never }, DEFAULT_PROMPT)
    expect(next.metrics).toEqual([{ name: 'NPV', weight: 25 }])
  })

  it('пустой массив метрик уважается', () => {
    expect(hydratePrompt({ metrics: [] }, DEFAULT_PROMPT).metrics).toEqual([])
  })
})

describe('computeRanking', () => {
  const metrics = [
    { name: 'NPV', weight: 2 },
    { name: 'IRR', weight: 1 },
  ]

  it('проект без разбора моделью не ранжируется', () => {
    const result = computeRanking(readyProject({ extractedByLlm: false }), metrics)
    expect(result).toEqual({ byMetrics: false, parts: [], weightSum: 0 })
  })

  it('проект не в статусе ready не ранжируется', () => {
    expect(computeRanking(readyProject({ status: 'processing' }), metrics).score).toBeUndefined()
  })

  it('взвешенное среднее по метрикам', () => {
    const project = readyProject({
      note: { financials: [{ metric: 'NPV', value: '', score: 90 }, { metric: 'IRR', value: '', score: 60 }] },
    } as Partial<Project>)
    const result = computeRanking(project, metrics)
    expect(result.score).toBe(80)
    expect(result.fit).toBe('advantageous')
    expect(result.byMetrics).toBe(true)
    expect(result.weightSum).toBe(3)
    expect(result.parts).toHaveLength(2)
    expect(result.parts[0]).toEqual({ name: 'NPV', weight: 2, score: 90, contribution: 180 })
  })

  it('метрика с нулевым весом пропускается', () => {
    const project = readyProject({
      note: { financials: [{ metric: 'NPV', value: '', score: 90 }] },
    } as Partial<Project>)
    const result = computeRanking(project, [{ name: 'NPV', weight: 0 }])
    expect(result.byMetrics).toBe(false)
    expect(result.parts).toEqual([])
  })

  it('метрика без балла пропускается', () => {
    const project = readyProject({
      note: { financials: [{ metric: 'NPV', value: 'недостаточно данных' }, { metric: 'IRR', value: '', score: 70 }] },
    } as Partial<Project>)
    const result = computeRanking(project, metrics)
    expect(result.score).toBe(70)
    expect(result.parts).toHaveLength(1)
  })

  it('без совпадений падает на прежний балл проекта', () => {
    const project = readyProject({ concessionScore: 65, concessionFit: 'average' })
    const result = computeRanking(project, metrics)
    expect(result.score).toBe(65)
    expect(result.fit).toBe('average')
    expect(result.byMetrics).toBe(false)
  })

  it('если баллов нет совсем — ранга нет', () => {
    expect(computeRanking(readyProject(), metrics).score).toBeUndefined()
  })

  it('пустой список метрик использует прежний балл', () => {
    expect(computeRanking(readyProject({ score: 80 }), []).score).toBe(80)
  })
})

describe('applyRanking', () => {
  it('без ранга возвращает тот же объект', () => {
    const project = readyProject()
    expect(applyRanking(project, [{ name: 'NPV', weight: 1 }])).toBe(project)
  })

  it('записывает балл и вывод в проект', () => {
    const project = readyProject({
      note: { financials: [{ metric: 'NPV', value: '', score: 84 }] },
    } as Partial<Project>)
    const next = applyRanking(project, [{ name: 'NPV', weight: 1 }])
    expect(next.concessionScore).toBe(84)
    expect(next.concessionFit).toBe('advantageous')
    expect(project.concessionScore).toBeUndefined()
  })
})

describe('форматирование', () => {
  it('проценты с запятой', () => {
    expect(formatPct(12.34)).toBe('12,3%')
    expect(formatPct(12.34, 2)).toBe('12,34%')
    expect(formatPct(5, 0)).toBe('5%')
  })

  it('миллиарды с одним знаком', () => {
    expect(formatBln(12.34)).toContain('12,3')
    expect(formatBln(12.34).endsWith('млрд ₽')).toBe(true)
  })
})

describe('slugify', () => {
  it('пробелы становятся дефисами', () => {
    expect(slugify('Республика Татарстан')).toBe('республика-татарстан')
  })

  it('ё превращается в е', () => {
    expect(slugify('Тёплый Стан')).toBe('теплый-стан')
  })

  it('знаки препинания срезаются', () => {
    expect(slugify('Ханты-Мансийский АО — Югра')).toBe('ханты-мансийский-ао-югра')
  })

  it('дефисы по краям убираются', () => {
    expect(slugify('  Москва  ')).toBe('москва')
    expect(slugify('!Москва!')).toBe('москва')
  })
})
