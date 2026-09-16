import { buildMasterInstructions, CONCESSION_TERM_ITEMS, normalizeTermRows, termsSchemaObject } from './promptMaster.js'

function metricList(prompt) {
  const raw = Array.isArray(prompt?.metrics) ? prompt.metrics : []
  return raw
    .map((item) => (typeof item === 'string' ? { name: item, weight: 10 } : item))
    .filter((item) => item?.name)
}

export function buildExtractionPrompts({ prompt, notes, markdown, fileName }) {
  const metrics = metricList(prompt)
  const metricNames = metrics.length ? metrics.map((item) => item.name) : ['NPV', 'IRR', 'DPP']

  const schema = {
    terms: termsSchemaObject(),
    riskBalance: {
      exceptions: 'условия, по которым баланс рисков нарушен, из MD',
      statement:
        'Проект КС представляется относительно сбалансированным по распределению рисков, за исключением условий о …',
    },
    assessment: {
      imperativeLaw: 'соответствие императивным нормам закона по MD',
      executionRealism: 'реалистичность исполнения, в т.ч. отсутствие или наличие ПД и ЗУ',
      investorFinance: 'финансовая целесообразность для инвестора, распределение рисков и доходов',
    },
    name: 'string',
    industry: 'string',
    country: 'string',
    region: 'string',
    budget: 0,
    recommendation: 'invest | revise | reject',
    score: 0,
    note: {
      description: 'связный абзац: проект + закон + ПД/ЗУ + выгода инвестора',
      executiveSummary: 'string',
      industryContext: 'string',
      location: 'string',
      budgetBreakdown: 'string',
      financials: metricNames.map((name) => ({
        metric: name,
        value: 'string',
        comment: 'string',
        score: 0,
      })),
      scenarios: [{ name: 'Базовый', npv: 'string', irr: 'string' }],
      risks: [{ title: 'string', level: 'low | mid | high', text: 'string' }],
      recommendation: 'string',
    },
  }

  const systemPrompt = [
    buildMasterInstructions(prompt),
    '',
    'Верни ТОЛЬКО JSON без markdown-ограждений и без комментариев вне JSON.',
    'Первые ключи верхнего уровня: terms, riskBalance, assessment. Потом name и note.',
    'Все факты только из Markdown ниже. Пустые факты — «недостаточно данных».',
  ].join('\n')

  const userPrompt = [
    `Файл: ${fileName || 'без имени'}`,
    typeof fileName === 'string' && fileName.includes(',')
      ? 'Ниже несколько документов одного проекта. Своди параметры по всем файлам, противоречия помечай в comment.'
      : '',
    notes ? `Пояснения сотрудника:\n${notes}` : 'Пояснения сотрудника: нет',
    '',
    'Схема JSON (заполни по документу):',
    JSON.stringify(schema, null, 2),
    '',
    '--- Markdown документов ---',
    markdown,
  ]
    .filter(Boolean)
    .join('\n')

  return { systemPrompt, userPrompt }
}

function rankFromNote(note, prompt) {
  const rows = Array.isArray(note?.financials) ? note.financials : []
  const metrics = metricList(prompt)
  let weighted = 0
  let weightSum = 0
  for (const metric of metrics) {
    const weight = Number(metric.weight)
    if (!Number.isFinite(weight) || weight <= 0) continue
    const row = rows.find((item) => String(item?.metric || '').toLowerCase().includes(String(metric.name).toLowerCase()) || String(metric.name).toLowerCase().includes(String(item?.metric || '').toLowerCase()))
    const score = Number(row?.score)
    if (!Number.isFinite(score)) continue
    const clamped = Math.min(100, Math.max(0, Math.round(score)))
    weighted += clamped * weight
    weightSum += weight
  }
  if (weightSum <= 0) return null
  const score = Math.min(100, Math.max(0, Math.round(weighted / weightSum)))
  return {
    concessionScore: score,
    concessionFit: score >= 78 ? 'advantageous' : score >= 58 ? 'average' : 'unfavorable',
  }
}

export function applyExtraction(project, data, prompt) {
  if (!data || typeof data !== 'object') return project
  const next = { ...project }
  if (typeof data.name === 'string' && data.name.trim() && !project.name?.trim()) {
    next.name = data.name.trim()
  }
  if (typeof data.industry === 'string' && data.industry.trim()) next.industry = data.industry.trim()
  if (typeof data.country === 'string' && data.country.trim()) next.country = data.country.trim()
  if (typeof data.region === 'string' && data.region.trim()) next.region = data.region.trim()
  if (data.budget != null && data.budget !== '') {
    const budget = Number(String(data.budget).replace(/\s/g, '').replace(',', '.'))
    if (Number.isFinite(budget) && budget >= 0) next.budget = budget
  }
  if (data.recommendation === 'invest' || data.recommendation === 'revise' || data.recommendation === 'reject') {
    next.recommendation = data.recommendation
  }
  if (data.score != null && data.score !== '') {
    const score = Number(data.score)
    if (Number.isFinite(score)) next.score = Math.min(100, Math.max(0, Math.round(score)))
  }
  if (data.note && typeof data.note === 'object') {
    next.note = mergeNote(project.note, {
      ...data.note,
      description: data.note.description || data.description,
      executiveSummary: data.note.executiveSummary || data.executiveSummary,
      terms: data.note.terms ?? data.terms,
      assessment: data.note.assessment ?? data.assessment,
      riskBalance: data.note.riskBalance ?? data.riskBalance,
    })
  } else if (data.terms || data.assessment || data.riskBalance || data.description) {
    next.note = mergeNote(project.note, {
      description: data.description,
      executiveSummary: data.executiveSummary,
      terms: data.terms,
      assessment: data.assessment,
      riskBalance: data.riskBalance,
    })
  }
  next.extractedByLlm = true
  const ranked = rankFromNote(next.note, prompt)
  if (ranked) {
    next.concessionScore = ranked.concessionScore
    next.concessionFit = ranked.concessionFit
    next.score = next.score ?? ranked.concessionScore
  }
  return next
}

function emptyTerms() {
  return normalizeTermRows(null)
}

function mergeNote(current, incoming) {
  const base = current ?? {
    executiveSummary: '',
    description: '',
    industryContext: '',
    location: '',
    budgetBreakdown: '',
    financials: [],
    scenarios: [],
    risks: [],
    recommendation: '',
    riskBalance: { exceptions: '', statement: '' },
    terms: emptyTerms(),
    assessment: { imperativeLaw: '', executionRealism: '', investorFinance: '' },
  }
  return {
    executiveSummary: pickText(incoming.executiveSummary, base.executiveSummary),
    description: pickText(incoming.description, base.description),
    industryContext: pickText(incoming.industryContext, base.industryContext),
    location: pickText(incoming.location, base.location),
    budgetBreakdown: pickText(incoming.budgetBreakdown, base.budgetBreakdown),
    financials: Array.isArray(incoming.financials) && incoming.financials.length ? incoming.financials.map(normalizeFinancial) : base.financials,
    scenarios: Array.isArray(incoming.scenarios) && incoming.scenarios.length ? incoming.scenarios.map(normalizeScenario) : base.scenarios,
    risks: Array.isArray(incoming.risks) && incoming.risks.length ? incoming.risks.map(normalizeRisk) : base.risks,
    recommendation: pickText(incoming.recommendation, base.recommendation),
    riskBalance: mergeRiskBalance(base.riskBalance, incoming.riskBalance),
    terms: mergeTerms(base.terms, incoming.terms),
    assessment: {
      imperativeLaw: pickText(incoming.assessment?.imperativeLaw, base.assessment?.imperativeLaw),
      executionRealism: pickText(incoming.assessment?.executionRealism, base.assessment?.executionRealism),
      investorFinance: pickText(incoming.assessment?.investorFinance, base.assessment?.investorFinance),
    },
  }
}

function mergeRiskBalance(current = {}, incoming) {
  const exceptions = pickText(incoming?.exceptions, current.exceptions)
  const statement = pickText(
    incoming?.statement,
    exceptions
      ? `Проект КС представляется относительно сбалансированным по распределению рисков, за исключением условий о ${exceptions}.`
      : current.statement,
  )
  return { exceptions, statement }
}

function mergeTerms(current = [], incoming) {
  const incomingRows = normalizeTermRows(incoming)
  const currentRows = normalizeTermRows(current)
  return CONCESSION_TERM_ITEMS.map((item, index) => ({
    id: item.id,
    label: item.label,
    value: incomingRows[index]?.value || currentRows[index]?.value || '',
    group: item.group,
  }))
}

function pickText(value, fallback) {
  return typeof value === 'string' && value.trim() ? value : fallback || ''
}

function normalizeFinancial(row) {
  const score = row?.score == null || row.score === '' ? undefined : Number(row.score)
  return {
    metric: String(row?.metric || '').trim(),
    value: String(row?.value || ''),
    comment: String(row?.comment || ''),
    score: Number.isFinite(score) ? Math.min(100, Math.max(0, Math.round(score))) : undefined,
  }
}

function normalizeScenario(row) {
  return {
    name: String(row?.name || ''),
    npv: String(row?.npv || ''),
    irr: String(row?.irr || ''),
  }
}

function normalizeRisk(row) {
  const level = row?.level === 'low' || row?.level === 'high' ? row.level : 'mid'
  return {
    title: String(row?.title || ''),
    level,
    text: String(row?.text || ''),
  }
}
