import { describe, expect, it } from 'vitest'

import { applyExtraction, buildExtractionPrompts } from '../../server/extractPrompt.js'

const PROMPT = {
  metrics: [
    { name: 'NPV', weight: 2 },
    { name: 'IRR', weight: 1 },
  ],
}

describe('buildExtractionPrompts', () => {
  it('собирает системный и пользовательский промпт', () => {
    const { systemPrompt, userPrompt } = buildExtractionPrompts({
      prompt: PROMPT,
      notes: 'Смотреть на ЗУ',
      markdown: '# Проект\nтекст',
      fileName: 'teo.pdf',
    })
    expect(systemPrompt).toContain('Верни ТОЛЬКО JSON')
    expect(userPrompt).toContain('Файл: teo.pdf')
    expect(userPrompt).toContain('Пояснения сотрудника:\nСмотреть на ЗУ')
    expect(userPrompt).toContain('--- Markdown документов ---')
    expect(userPrompt).toContain('# Проект')
  })

  it('без имени файла подставляет заглушку', () => {
    const { userPrompt } = buildExtractionPrompts({ prompt: PROMPT, markdown: 'md' })
    expect(userPrompt).toContain('Файл: без имени')
    expect(userPrompt).toContain('Пояснения сотрудника: нет')
  })

  it('несколько файлов через запятую включают правило сводки', () => {
    const many = buildExtractionPrompts({ prompt: PROMPT, markdown: 'md', fileName: 'a.pdf, b.pdf' })
    expect(many.userPrompt).toContain('Ниже несколько документов одного проекта')

    const one = buildExtractionPrompts({ prompt: PROMPT, markdown: 'md', fileName: 'a.pdf' })
    expect(one.userPrompt).not.toContain('Ниже несколько документов')
  })

  it('схема повторяет заданные метрики', () => {
    const { userPrompt } = buildExtractionPrompts({ prompt: PROMPT, markdown: 'md' })
    const schema = JSON.parse(userPrompt.slice(userPrompt.indexOf('{'), userPrompt.lastIndexOf('}') + 1))
    expect(schema.note.financials.map((row) => row.metric)).toEqual(['NPV', 'IRR'])
    expect(Object.keys(schema.terms)).toHaveLength(18)
  })

  it('без метрик берёт NPV, IRR, DPP', () => {
    const { userPrompt } = buildExtractionPrompts({ prompt: {}, markdown: 'md' })
    expect(userPrompt).toContain('"metric": "NPV"')
    expect(userPrompt).toContain('"metric": "DPP"')
  })

  it('метрики строками тоже принимаются', () => {
    const { userPrompt } = buildExtractionPrompts({ prompt: { metrics: ['DSCR'] }, markdown: 'md' })
    expect(userPrompt).toContain('"metric": "DSCR"')
  })
})

describe('applyExtraction', () => {
  const base = { id: 'p1', name: '', status: 'processing' }

  it('мусорные данные возвращают проект как есть', () => {
    expect(applyExtraction(base, null, PROMPT)).toBe(base)
    expect(applyExtraction(base, 'строка', PROMPT)).toBe(base)
  })

  it('не мутирует исходный проект', () => {
    const project = { ...base }
    applyExtraction(project, { industry: 'Транспорт' }, PROMPT)
    expect(project.industry).toBeUndefined()
  })

  it('ставит флаг разбора моделью', () => {
    expect(applyExtraction(base, { industry: 'Транспорт' }, PROMPT).extractedByLlm).toBe(true)
  })

  it('название подставляется только в пустое поле', () => {
    expect(applyExtraction(base, { name: 'Мост' }, PROMPT).name).toBe('Мост')
    const named = applyExtraction({ ...base, name: 'Своё имя' }, { name: 'Мост' }, PROMPT)
    expect(named.name).toBe('Своё имя')
  })

  it('текстовые поля обрезаются от пробелов, пустые игнорируются', () => {
    const next = applyExtraction(base, { industry: '  Транспорт  ', country: '', region: 'Тверская' }, PROMPT)
    expect(next.industry).toBe('Транспорт')
    expect(next.region).toBe('Тверская')
    expect(next.country).toBeUndefined()
  })

  it('бюджет чистится от пробелов и запятой', () => {
    expect(applyExtraction(base, { budget: '12 500 000 000' }, PROMPT).budget).toBe(12_500_000_000)
    expect(applyExtraction(base, { budget: '1,5' }, PROMPT).budget).toBe(1.5)
  })

  it('отрицательный и нечисловой бюджет отбрасывается', () => {
    expect(applyExtraction(base, { budget: -5 }, PROMPT).budget).toBeUndefined()
    expect(applyExtraction(base, { budget: 'много' }, PROMPT).budget).toBeUndefined()
  })

  it('рекомендация только из белого списка', () => {
    expect(applyExtraction(base, { recommendation: 'invest' }, PROMPT).recommendation).toBe('invest')
    expect(applyExtraction(base, { recommendation: 'maybe' }, PROMPT).recommendation).toBeUndefined()
  })

  it('балл зажимается в 0–100 и округляется', () => {
    expect(applyExtraction(base, { score: 140 }, PROMPT).score).toBe(100)
    expect(applyExtraction(base, { score: -8 }, PROMPT).score).toBe(0)
    expect(applyExtraction(base, { score: 71.6 }, PROMPT).score).toBe(72)
  })

  it('ранжирует по весам метрик из записки', () => {
    const next = applyExtraction(
      base,
      {
        note: {
          financials: [
            { metric: 'NPV', score: 90 },
            { metric: 'IRR', score: 60 },
          ],
        },
      },
      PROMPT,
    )
    expect(next.concessionScore).toBe(80)
    expect(next.concessionFit).toBe('advantageous')
    expect(next.score).toBe(80)
  })

  it('порог среднего и невыгодного', () => {
    const mid = applyExtraction(base, { note: { financials: [{ metric: 'NPV', score: 60 }] } }, { metrics: [{ name: 'NPV', weight: 1 }] })
    expect(mid.concessionFit).toBe('average')

    const bad = applyExtraction(base, { note: { financials: [{ metric: 'NPV', score: 30 }] } }, { metrics: [{ name: 'NPV', weight: 1 }] })
    expect(bad.concessionFit).toBe('unfavorable')
  })

  it('явный балл не перетирается ранжированием', () => {
    const next = applyExtraction(base, { score: 50, note: { financials: [{ metric: 'NPV', score: 90 }] } }, PROMPT)
    expect(next.score).toBe(50)
    expect(next.concessionScore).toBe(90)
  })

  it('нулевые веса не дают ранга', () => {
    const next = applyExtraction(base, { note: { financials: [{ metric: 'NPV', score: 90 }] } }, { metrics: [{ name: 'NPV', weight: 0 }] })
    expect(next.concessionScore).toBeUndefined()
  })

  it('метрика без балла в ранг не идёт', () => {
    const next = applyExtraction(
      base,
      { note: { financials: [{ metric: 'NPV', score: 90 }, { metric: 'IRR', value: 'недостаточно данных' }] } },
      PROMPT,
    )
    expect(next.concessionScore).toBe(90)
  })

  it('условия КС нормализуются в 18 строк', () => {
    const next = applyExtraction(base, { terms: { subject: 'Мост', object: 'Путепровод' } }, PROMPT)
    expect(next.note.terms).toHaveLength(18)
    expect(next.note.terms.find((row) => row.id === 'subject').value).toBe('Мост')
  })

  it('баланс рисков собирается из перечня исключений', () => {
    const next = applyExtraction(base, { riskBalance: { exceptions: 'сроках ввода' } }, PROMPT)
    expect(next.note.riskBalance.exceptions).toBe('сроках ввода')
    expect(next.note.riskBalance.statement).toContain('за исключением условий о сроках ввода')
  })

  it('готовая формулировка баланса рисков сохраняется', () => {
    const next = applyExtraction(base, { riskBalance: { exceptions: 'x', statement: 'Своя фраза' } }, PROMPT)
    expect(next.note.riskBalance.statement).toBe('Своя фраза')
  })

  it('уровень риска приводится к low/mid/high', () => {
    const next = applyExtraction(
      base,
      { note: { risks: [{ title: 'Срыв', level: 'катастрофа' }, { title: 'Спрос', level: 'high' }] } },
      PROMPT,
    )
    expect(next.note.risks[0].level).toBe('mid')
    expect(next.note.risks[1].level).toBe('high')
  })

  it('пустые массивы не затирают прежнюю записку', () => {
    const project = { ...base, note: { financials: [{ metric: 'NPV', value: '10', score: 70 }], risks: [], scenarios: [] } }
    const next = applyExtraction(project, { note: { financials: [] } }, PROMPT)
    expect(next.note.financials).toHaveLength(1)
  })

  it('оценки закона и ПД/ЗУ переносятся с верхнего уровня', () => {
    const next = applyExtraction(
      base,
      { assessment: { imperativeLaw: 'соответствует', executionRealism: 'ПД нет', investorFinance: 'приемлемо' } },
      PROMPT,
    )
    expect(next.note.assessment).toEqual({
      imperativeLaw: 'соответствует',
      executionRealism: 'ПД нет',
      investorFinance: 'приемлемо',
    })
  })

  it('без note и без условий записка не создаётся', () => {
    const next = applyExtraction(base, { industry: 'Транспорт' }, PROMPT)
    expect(next.note).toBeUndefined()
  })
})
