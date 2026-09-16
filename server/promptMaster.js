export const CONCESSION_TERM_ITEMS = [
  { id: 'subject', label: 'Предмет соглашения' },
  { id: 'object', label: 'Объект' },
  { id: 'term', label: 'Срок действия' },
  { id: 'constructionTerm', label: 'Срок строительства (критерий конкурса)' },
  { id: 'operationTerm', label: 'Срок эксплуатации' },
  { id: 'investmentVolume', label: 'Объем инвестиций в создание Объекта' },
  { id: 'capitalGrant', label: 'Капитальный грант', group: 'Финансовое участие Концедента' },
  { id: 'lostRevenue', label: 'Возмещение недополученных доходов', group: 'Финансовое участие Концедента' },
  { id: 'violatorTravel', label: 'Компенсация стоимости проезда нарушителей', group: 'Финансовое участие Концедента' },
  { id: 'concessionFee', label: 'Концессионная плата' },
  { id: 'design', label: 'Проектирование' },
  { id: 'sitePreparation', label: 'Подготовка территории строительства' },
  { id: 'landPlots', label: 'Земельные участки' },
  { id: 'security', label: 'Обеспечение' },
  { id: 'liability', label: 'Ответственность (ключевые неустойки концессионера)' },
  { id: 'terminationCompensation', label: 'Компенсация при прекращении' },
  { id: 'specialCircumstances', label: 'Особые обстоятельства' },
  { id: 'directAgreement', label: 'Прямое соглашение' },
]

export function termsSchemaObject() {
  const obj = {}
  for (const item of CONCESSION_TERM_ITEMS) {
    obj[item.id] = `${item.group ? `${item.group}: ` : ''}${item.label} — 1–4 предложения строго из Markdown либо «недостаточно данных»`
  }
  return obj
}

function fold(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9]+/gi, '')
}

const TERM_ALIASES = {
  subject: ['subject', 'предмет', 'предметсоглашения'],
  object: ['object', 'объект', 'объектсоглашения', 'объекткс'],
  term: ['term', 'срокдействия', 'сроксоглашения'],
  constructionTerm: ['constructionterm', 'срокстроительства', 'критерийконкурса'],
  operationTerm: ['operationterm', 'срокэксплуатации'],
  investmentVolume: ['investmentvolume', 'объеминвестиций', 'инвестициивсоздание'],
  capitalGrant: ['capitalgrant', 'капитальныйгрант'],
  lostRevenue: ['lostrevenue', 'недополученныхдоходов', 'возмещениенедополученных'],
  violatorTravel: ['violatortravel', 'проезднарушителей', 'компенсацияпроезда'],
  concessionFee: ['concessionfee', 'концессионнаяплата'],
  design: ['design', 'проектирование'],
  sitePreparation: ['sitepreparation', 'подготовкатерритории', 'подготовкастроительства'],
  landPlots: ['landplots', 'земельныеучастки', 'земельныйучасток'],
  security: ['security', 'обеспечениеисполнения', 'обеспечение'],
  liability: ['liability', 'ответственность', 'неустойкиконцессионера'],
  terminationCompensation: ['terminationcompensation', 'компенсацияприпрекращении'],
  specialCircumstances: ['specialcircumstances', 'особыеобстоятельства'],
  directAgreement: ['directagreement', 'прямоесоглашение'],
}

export function matchConcessionTermId(raw) {
  const key = fold(raw)
  if (!key) return null
  for (const item of CONCESSION_TERM_ITEMS) {
    if (item.id === raw || fold(item.id) === key || fold(item.label) === key) return item.id
  }
  for (const item of CONCESSION_TERM_ITEMS) {
    const aliases = TERM_ALIASES[item.id] || []
    if (aliases.some((alias) => alias === key || (alias.length >= 10 && key.includes(alias)))) return item.id
  }
  return null
}

function termValue(value) {
  if (value == null) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (typeof value === 'object') {
    if (typeof value.value === 'string') return value.value.trim()
    if (typeof value.text === 'string') return value.text.trim()
  }
  return ''
}

export function normalizeTermRows(incoming) {
  const byId = new Map(CONCESSION_TERM_ITEMS.map((item) => [item.id, '']))
  const visit = (node, hint = '') => {
    if (node == null) return
    if (Array.isArray(node)) {
      for (const row of node) {
        if (!row || typeof row !== 'object') continue
        const id =
          matchConcessionTermId(row.id || '') ||
          matchConcessionTermId(row.key || '') ||
          matchConcessionTermId(row.label || '') ||
          matchConcessionTermId(row.name || '') ||
          matchConcessionTermId(row.title || '')
        if (id) byId.set(id, termValue(row) || byId.get(id))
        else visit(row)
      }
      return
    }
    if (typeof node !== 'object') {
      const id = matchConcessionTermId(hint)
      if (id) byId.set(id, termValue(node) || byId.get(id))
      return
    }
    for (const [key, value] of Object.entries(node)) {
      const id = matchConcessionTermId(key)
      if (id) {
        byId.set(id, termValue(value) || byId.get(id))
        continue
      }
      if (value && typeof value === 'object') visit(value, key)
    }
  }
  visit(incoming)
  return CONCESSION_TERM_ITEMS.map((item) => ({
    id: item.id,
    label: item.label,
    value: byId.get(item.id) || '',
    group: item.group,
  }))
}

export const PROMPT_SECTIONS = [
  { id: 'executive', title: 'Резюме для руководства', hint: '1 страница: суть, цифры, рекомендация' },
  { id: 'description', title: 'Описание проекта', hint: 'что строится, сроки, инициатор; оценка закона, ПД/ЗУ и выгодности для инвестора' },
  { id: 'industry', title: 'Отраслевой контекст', hint: 'рынок, конкуренция, регуляторика' },
  { id: 'location', title: 'Локация и инфраструктура', hint: 'страна, регион, логистика, кадры' },
  { id: 'budget', title: 'Бюджет и структура затрат', hint: 'CAPEX/OPEX, источники финансирования' },
  { id: 'financials', title: 'Финансовая модель', hint: 'NPV, IRR, DPP, WACC, чувствительность' },
  { id: 'scenarios', title: 'Сценарный анализ', hint: 'базовый / оптимистичный / стресс' },
  { id: 'risks', title: 'Риски', hint: 'матрица вероятность × влияние; баланс распределения' },
  { id: 'comparables', title: 'Сравнение с аналогами', hint: 'benchmark по отрасли и региону' },
  { id: 'esg', title: 'ESG и комплаенс', hint: 'экология, социальные эффекты, санкционный контур' },
  { id: 'recommendation', title: 'Инвестиционная рекомендация', hint: 'инвестировать / доработать / отклонить' },
]

const TONE_LABEL = {
  formal: 'деловой служебный стиль, без эмоций и маркетинговых формулировок',
  board: 'стиль доклада инвесткомитету: коротко, с акцентом на решение',
  brief: 'сжатая справка: только факты, цифры и вывод',
}

const DEPTH_LABEL = {
  brief: 'краткий разбор, до 1,5 страниц',
  standard: 'стандартная записка, 3–5 страниц',
  deep: 'глубокий разбор с приложениями по чувствительности',
}

const FORMAT_LABEL = {
  memo: 'служебная записка с нумерованными разделами',
  'slides-outline': 'структура как конспект слайдов: тезис → цифра → вывод',
  'table-first': 'сначала таблицы метрик и рисков, затем комментарий',
}

export function buildMasterInstructions(prompt = {}) {
  const enabled = PROMPT_SECTIONS.filter((section) => prompt.sections?.[section.id] !== false)
  const lang = prompt.language === 'en' ? 'английском' : 'русском'
  const tone = TONE_LABEL[prompt.tone] || TONE_LABEL.formal
  const depth = DEPTH_LABEL[prompt.depth] || DEPTH_LABEL.standard
  const format = FORMAT_LABEL[prompt.outputFormat] || FORMAT_LABEL.memo
  const notesRule = prompt.useEmployeeNotes
    ? 'Пояснения сотрудника финансового отдела имеют приоритет над извлечёнными из файла гипотезами. Расхождения помечай явно.'
    : 'Пояснения сотрудника используй только как справочный контекст.'
  const recRule =
    prompt.recommendationStyle === 'narrative'
      ? 'Итоговая рекомендация — связный абзац с аргументами «за» и «против». Поле recommendation всё равно одно из invest/revise/reject.'
      : 'Итоговая рекомендация — один из трёх статусов: инвестировать / доработать / отклонить, плюс 2–4 условия. Поле recommendation: invest, revise или reject.'
  const extras = []
  if (prompt.includeComparables || prompt.sections?.comparables) extras.push('добавь блок сравнения с отраслевыми аналогами')
  if (prompt.includeEsg || prompt.sections?.esg) extras.push('включи ESG и санкционный контур')
  const metrics = Array.isArray(prompt.metrics) ? prompt.metrics.filter((item) => item?.name) : []
  const metricLine = metrics.length
    ? metrics.map((item) => `${item.name} — вес ${item.weight ?? 10}`).join(', ')
    : 'NPV, IRR, DPP, WACC, EBITDA margin, DSCR'
  const termCatalog = CONCESSION_TERM_ITEMS.map((item) => `- ${item.id}: ${item.group ? `${item.group} / ` : ''}${item.label}`).join('\n')

  return [
    `Ты — ${prompt.role || 'Старший финансовый аналитик инвестиционного комитета.'}`,
    `Пиши на ${lang} языке, ${tone}. Глубина: ${depth}. Формат: ${format}.`,
    'Задача: заполнить карточку концессионного проекта СТРОГО по Markdown документов (после Docling). Нельзя опираться на общие знания вместо файла.',
    notesRule,
    recRule,
    extras.length ? `Дополнительно: ${extras.join('; ')}.` : '',
    'Порядок ключей JSON обязателен: сначала terms, riskBalance, assessment, description; затем остальные поля записки. Так карточка КС не обрезается.',
    'terms — объект с фиксированными ключами (не массив и не переименовывай ключи):',
    termCatalog,
    'Каждый ключ terms обязателен. Значение: сжатие 1–4 предложений из Markdown. Если пункта нет в MD — ровно «недостаточно данных». Не выдумывай сроки, суммы и стороны.',
    'capitalGrant, lostRevenue, violatorTravel — три отдельных поля финансового участия концедента, не склеивай их в одно.',
    'riskBalance.exceptions — перечень условий, где баланс рисков нарушен (после слов «условиях о»). riskBalance.statement — фраза: «Проект КС представляется относительно сбалансированным по распределению рисков, за исключением условий о {exceptions}.» Если перекосов нет: exceptions = «критичных перекосов не выявлено».',
    'assessment.imperativeLaw — соответствие императивным нормам закона по тексту MD.',
    'assessment.executionRealism — реалистичность исполнения в текущих условиях, отдельно про отсутствие или наличие ПД и ЗУ.',
    'assessment.investorFinance — финансовая целесообразность для инвестора: как распределены риски и доходы.',
    'description — связный абзац описания проекта, в котором явно звучат эти три оценки (закон, ПД/ЗУ, выгода инвестора). Не подменяй описание списком метрик.',
    'Обязательные разделы записки после карточки:',
    ...enabled.map((section, index) => `${index + 1}. ${section.title} — ${section.hint}`),
    `Обязательные метрики (вес = вклад в ранжирование выгодности): ${metricLine}. Для каждой метрики укажи значение как в документе и балл привлекательности для концессионера 0–100. Если метрики нет — value «недостаточно данных», score не ставь.`,
    'budget — число в рублях. Если в документе млрд — умножь на 1e9. Не выдумывай цифры, которых нет в Markdown.',
    prompt.extraInstructions ? `Особые указания:\n${prompt.extraInstructions}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}
