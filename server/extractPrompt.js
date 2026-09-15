function metricList(prompt) {
  const raw = Array.isArray(prompt?.metrics) ? prompt.metrics : []
  return raw
    .map((item) => (typeof item === 'string' ? { name: item, weight: 10 } : item))
    .filter((item) => item?.name)
}

export function buildExtractionPrompts({ prompt, notes, markdown, fileName }) {
  const metrics = metricList(prompt)
  const metricLine = metrics.length
    ? metrics.map((item) => `${item.name} (вес ${item.weight})`).join(', ')
    : 'NPV, IRR, DPP, WACC, EBITDA margin, DSCR'
  const metricNames = metrics.length ? metrics.map((item) => item.name) : ['NPV', 'IRR', 'DPP']
  const lang = prompt?.language === 'en' ? 'English' : 'русском'
  const notesRule = prompt?.useEmployeeNotes
    ? 'Пояснения сотрудника имеют приоритет над гипотезами из файла. Расхождения пометь в comment.'
    : 'Пояснения сотрудника — только справочный контекст.'
  const recRule =
    prompt?.recommendationStyle === 'narrative'
      ? 'recommendation: связный вердикт без светофора, но поле recommendation всё равно одно из invest/revise/reject.'
      : 'recommendation: строго invest, revise или reject.'

  const systemPrompt = [
    prompt?.role || 'Старший финансовый аналитик инвестиционного комитета.',
    `Отвечай на ${lang} языке.`,
    'Тебе дают Markdown документа (часто с сложными таблицами после Docling). Извлеки параметры концессионного проекта.',
    'Верни ТОЛЬКО JSON без markdown-ограждений и без комментариев вне JSON.',
    notesRule,
    recRule,
    `Обязательные метрики: ${metricLine}.`,
    'Для каждой метрики: value как в документе (с единицами), comment кратко, score — балл привлекательности для концессионера 0–100.',
    'Если метрики нет в документе: value = «недостаточно данных», score не ставь, ничего не выдумывай.',
    'budget — число в рублях (не строка). Если в млрд — умножь на 1e9.',
    'Не выдумывай цифры, которых нет в Markdown.',
    prompt?.extraInstructions ? `Особые указания: ${prompt.extraInstructions}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  const schema = {
    name: 'string',
    industry: 'string',
    country: 'string',
    region: 'string',
    budget: 0,
    recommendation: 'invest | revise | reject',
    score: 0,
    note: {
      executiveSummary: 'string',
      description: 'string',
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

  const userPrompt = [
    `Файл: ${fileName || 'без имени'}`,
    notes ? `Пояснения сотрудника:\n${notes}` : 'Пояснения сотрудника: нет',
    '',
    'Схема JSON (заполни по документу):',
    JSON.stringify(schema, null, 2),
    '',
    '--- Markdown документа ---',
    markdown,
  ].join('\n')

  return { systemPrompt, userPrompt }
}

export function applyExtraction(project, data) {
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
    next.note = mergeNote(project.note, data.note)
  }
  if (next.score != null || next.recommendation) {
    const concessionScore = next.score ?? (next.recommendation === 'invest' ? 82 : next.recommendation === 'revise' ? 64 : 42)
    next.concessionScore = concessionScore
    next.concessionFit = concessionScore >= 78 ? 'advantageous' : concessionScore >= 58 ? 'average' : 'unfavorable'
  }
  next.extractedByLlm = true
  return next
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
  }
}

function pickText(value, fallback) {
  return typeof value === 'string' && value.trim() ? value : fallback
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
