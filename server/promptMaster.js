export const CONCESSION_TERM_ITEMS = [
  { id: 'subject', label: 'Предмет соглашения' },
  { id: 'object', label: 'Объект' },
  { id: 'term', label: 'Срок действия' },
  { id: 'constructionTerm', label: 'Срок строительства (критерий конкурса)' },
  { id: 'operationTerm', label: 'Срок эксплуатации' },
  { id: 'investmentVolume', label: 'Объем инвестиций в создание Объекта' },
  { id: 'capitalGrant', label: 'Финансовое участие Концедента — капитальный грант' },
  { id: 'lostRevenue', label: 'Финансовое участие Концедента — возмещение недополученных доходов' },
  { id: 'violatorTravel', label: 'Финансовое участие Концедента — компенсация стоимости проезда нарушителей' },
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

  return [
    `Ты — ${prompt.role || 'Старший финансовый аналитик инвестиционного комитета.'}`,
    `Пиши на ${lang} языке, ${tone}. Глубина: ${depth}. Формат: ${format}.`,
    'Задача: подготовить аналитическую записку по концессионному проекту на основании Markdown документов (часто после Docling) и карточки объекта.',
    notesRule,
    recRule,
    extras.length ? `Дополнительно: ${extras.join('; ')}.` : '',
    'Обязательные разделы:',
    ...enabled.map((section, index) => `${index + 1}. ${section.title} — ${section.hint}`),
    `Обязательные метрики (вес = вклад в ранжирование выгодности): ${metricLine}. Для каждой метрики укажи значение как в документе и балл привлекательности для концессионера 0–100. Если метрики нет — value «недостаточно данных», score не ставь, ничего не выдумывай. Итоговый рейтинг объекта считается только после разбора, как взвешенное среднее баллов по этим весам.`,
    'Основные условия проекта КС заполни таблицей note.terms: для каждой строки label и value. Если пункта нет в документах — value «недостаточно данных». Не выдумывай цифры и сроки.',
    'note.riskBalance.exceptions — конкретные условия, по которым распределение рисков не сбалансировано (после слов «условиях о»). note.riskBalance.statement — целая фраза вида: «Проект КС представляется относительно сбалансированным по распределению рисков, за исключением условий о {exceptions}.» Если перекосов нет, exceptions = «критичных перекосов не выявлено».',
    'При формировании описания проекта отдельно оцени и запиши в note.assessment: (1) соответствие императивным нормам закона; (2) реалистичность исполнения в текущих условиях, в том числе отсутствие ПД и ЗУ; (3) финансовую целесообразность для инвестора — распределение рисков и доходов. Эти три вывода также отрази в note.description.',
    'budget — число в рублях. Если в документе млрд — умножь на 1e9. Не выдумывай цифры, которых нет в Markdown.',
    prompt.extraInstructions ? `Особые указания:\n${prompt.extraInstructions}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}
