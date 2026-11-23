import { buildMasterInstructions, CONCESSION_TERM_ITEMS, normalizeTermRows, PROMPT_SECTIONS, termsSchemaObject } from './promptMaster.js'

const LEGACY_KPI = new Set(['npv', 'irr', 'dpp', 'wacc', 'ebitda', 'ebitdamargin', 'dscr'])

function fold(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9]+/gi, '')
}

function metricList(prompt) {
  const raw = Array.isArray(prompt?.metrics) ? prompt.metrics : []
  return raw
    .map((item) => (typeof item === 'string' ? { name: item, weight: 10 } : item))
    .filter((item) => item?.name || item?.id)
}

function resolveSection(item) {
  const id = String(item?.id || '').trim()
  if (id) {
    const hit = PROMPT_SECTIONS.find((section) => section.id === id)
    if (hit) return hit
  }
  const key = fold(item?.name)
  if (!key) return null
  return PROMPT_SECTIONS.find((section) => section.id === key || fold(section.title) === key) || null
}

export function rankingMetrics(prompt) {
  const raw = metricList(prompt)
  const fromPrompt = raw
    .map((item) => {
      const section = resolveSection(item)
      if (!section) return null
      const weight = Number(item.weight)
      return { id: section.id, name: section.title, weight: Number.isFinite(weight) ? weight : 10 }
    })
    .filter(Boolean)
  if (fromPrompt.length) return fromPrompt
  const legacy = raw.filter((item) => LEGACY_KPI.has(fold(item.name)))
  if (legacy.length) {
    return legacy.map((item) => {
      const weight = Number(item.weight)
      return { id: fold(item.name), name: item.name, weight: Number.isFinite(weight) ? weight : 10 }
    })
  }
  return PROMPT_SECTIONS.filter((section) => prompt?.sections?.[section.id] !== false).map((section) => ({
    id: section.id,
    name: section.title,
    weight: 10,
  }))
}

export function parseSectionScores(raw) {
  const out = {}
  const put = (hint, score) => {
    const section = resolveSection({ id: hint, name: hint })
    const num = Number(score)
    if (!section || !Number.isFinite(num)) return
    out[section.id] = Math.min(100, Math.max(0, Math.round(num)))
  }
  if (Array.isArray(raw)) {
    for (const row of raw) {
      if (!row || typeof row !== 'object') continue
      const section = resolveSection({ id: row.id, name: row.name || row.metric })
      if (section) put(section.id, row.score)
    }
    return out
  }
  if (raw && typeof raw === 'object') {
    for (const [key, value] of Object.entries(raw)) {
      if (value && typeof value === 'object' && 'score' in value) put(key, value.score)
      else put(key, value)
    }
  }
  return out
}

export function isSparseText(value) {
  const text = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е')
  return !text || text === 'недостаточно данных' || text === '—' || text === '-' || text === 'н/д'
}

export function buildExtractionPrompts({ prompt, notes, markdown, fileName, chunkIndex = 0, chunkTotal = 1 }) {
  const metrics = rankingMetrics(prompt)
  const sectionScores = Object.fromEntries(metrics.map((item) => [item.id, 0]))
  const multiChunk = chunkTotal > 1

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
      sectionScores,
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
    multiChunk
      ? `Это фрагмент ${chunkIndex + 1} из ${chunkTotal} полного комплекта документов. Заполняй только то, что явно есть в этом фрагменте. Если факта здесь нет — «недостаточно данных» или budget: 0. Не додумывай из других частей. Длинные таблицы могут быть разрезаны: в продолжении снова идут заголовки колонок — опирайся на них, чтобы читать строки.`
      : '',
  ]
    .filter(Boolean)
    .join('\n')

  const userPrompt = [
    `Файл: ${fileName || 'без имени'}`,
    multiChunk ? `Фрагмент Markdown: ${chunkIndex + 1}/${chunkTotal}` : '',
    typeof fileName === 'string' && fileName.includes(',')
      ? 'Ниже несколько документов одного проекта. Своди параметры по всем файлам, противоречия помечай в comment.'
      : '',
    notes ? `Пояснения сотрудника:\n${notes}` : 'Пояснения сотрудника: нет',
    '',
    'Схема JSON (заполни по документу):',
    JSON.stringify(schema, null, 2),
    '',
    multiChunk ? `--- Markdown фрагмент ${chunkIndex + 1}/${chunkTotal} ---` : '--- Markdown документов ---',
    markdown,
  ]
    .filter(Boolean)
    .join('\n')

  return { systemPrompt, userPrompt }
}

function lookupScore(note, metric) {
  const scores = parseSectionScores(note?.sectionScores)
  if (Number.isFinite(scores[metric.id])) return scores[metric.id]
  const rows = Array.isArray(note?.financials) ? note.financials : []
  const names = [metric.name, metric.id]
  const row = rows.find((item) => {
    const label = String(item?.metric || '').toLowerCase()
    return names.some((name) => label && (label.includes(String(name).toLowerCase()) || String(name).toLowerCase().includes(label)))
  })
  const score = Number(row?.score)
  return Number.isFinite(score) ? Math.min(100, Math.max(0, Math.round(score))) : null
}

function rankFromNote(note, prompt) {
  const metrics = rankingMetrics(prompt)
  let weighted = 0
  let weightSum = 0
  for (const metric of metrics) {
    const weight = Number(metric.weight)
    if (!Number.isFinite(weight) || weight <= 0) continue
    const score = lookupScore(note, metric)
    if (score == null) continue
    weighted += score * weight
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
    if (Number.isFinite(budget) && budget > 0) {
      const current = Number(project.budget)
      next.budget = Number.isFinite(current) && current > 0 ? Math.max(current, budget) : budget
    }
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
      sectionScores: data.note.sectionScores ?? data.sectionScores,
    })
  } else if (data.terms || data.assessment || data.riskBalance || data.description) {
    next.note = mergeNote(project.note, {
      description: data.description,
      executiveSummary: data.executiveSummary,
      terms: data.terms,
      assessment: data.assessment,
      riskBalance: data.riskBalance,
      sectionScores: data.sectionScores,
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
    sectionScores: {},
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
    sectionScores: { ...parseSectionScores(base.sectionScores), ...parseSectionScores(incoming.sectionScores) },
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
    value: keptText(incomingRows[index]?.value, currentRows[index]?.value),
    group: item.group,
  }))
}

function keptText(incoming, current) {
  if (!isSparseText(incoming)) return String(incoming).trim()
  if (!isSparseText(current)) return String(current).trim()
  return typeof incoming === 'string' && incoming.trim() ? String(incoming).trim() : current || ''
}

function pickText(value, fallback) {
  return keptText(value, fallback)
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
