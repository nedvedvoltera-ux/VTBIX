export const DEFAULT_MEDIA_KEYWORDS = [
  'концессия',
  'ГЧП',
  'инфраструктурный проект',
  'крупное строительство',
  'платная дорога',
  'транспортная инфраструктура',
  'очистные сооружения',
  'мусороперерабатывающий завод',
]

export const DEFAULT_MEDIA_SITES = [
  'interfax.ru',
  'tass.ru',
  'ria.ru',
  'kommersant.ru',
  'rbc.ru',
  'vedomosti.ru',
  'rg.ru',
  'iz.ru',
]

export const DEFAULT_MEDIA_PROMPT = {
  role:
    'Ты аналитик финансового блока. По публикациям в СМИ ищешь крупные строительные и инфраструктурные проекты в России и СНГ, куда банк мог бы предложить концессию или ГЧП. Отсекай мелкий ремонт, жилую точечную застройку без публичного партнёра и чистую политику без объекта.',
  extraInstructions:
    'В концессионном угле укажи, кто публичный партнёр, какой объект, есть ли намёк на частные инвестиции, платность, эксплуатацию или нехватку бюджета. Если в тексте нет объекта — не включай публикацию.',
  keywords: DEFAULT_MEDIA_KEYWORDS,
  sites: DEFAULT_MEDIA_SITES,
  searchMode: 'sites',
  language: 'ru',
  lookbackDays: 14,
  maxResults: 12,
}

export function normalizeDomain(raw) {
  const value = String(raw || '').trim()
  if (!value) return ''
  const withProto = /^https?:\/\//i.test(value) ? value : `https://${value}`
  try {
    return new URL(withProto).hostname.replace(/^www\./i, '').toLowerCase()
  } catch {
    return value
      .replace(/^https?:\/\//i, '')
      .replace(/^www\./i, '')
      .split('/')[0]
      .trim()
      .toLowerCase()
  }
}

function uniqueStrings(list) {
  const seen = new Set()
  const out = []
  for (const item of list || []) {
    const value = String(item || '').trim()
    if (!value) continue
    const key = value.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(value)
  }
  return out
}

export function hydrateMediaPrompt(raw) {
  const base = DEFAULT_MEDIA_PROMPT
  const merged = { ...base, ...(raw && typeof raw === 'object' ? raw : {}) }
  const sites = uniqueStrings((merged.sites || []).map(normalizeDomain)).filter(Boolean)
  return {
    role: String(merged.role || base.role),
    extraInstructions: String(merged.extraInstructions || ''),
    keywords: uniqueStrings(merged.keywords).slice(0, 40),
    sites: sites.slice(0, 40),
    searchMode: merged.searchMode === 'web' ? 'web' : 'sites',
    language: merged.language === 'en' ? 'en' : 'ru',
    lookbackDays: Math.min(90, Math.max(1, Number(merged.lookbackDays) || base.lookbackDays)),
    maxResults: Math.min(24, Math.max(4, Number(merged.maxResults) || base.maxResults)),
  }
}

export function buildMediaInstructions(prompt) {
  const cfg = hydrateMediaPrompt(prompt)
  const lang = cfg.language === 'en' ? 'English' : 'русском'
  const mode =
    cfg.searchMode === 'web'
      ? 'поиск по открытому вебу'
      : `поиск только по сайтам: ${cfg.sites.join(', ') || 'список пуст'}`
  return [
    cfg.role,
    `Ответ пиши на ${lang}.`,
    `Источник: ${mode}. Ключевые слова: ${cfg.keywords.join(', ') || 'не заданы'}.`,
    'Верни ТОЛЬКО JSON. В publications — только материалы, где есть крупный строительный/инфраструктурный объект и хотя бы намёк, что концессия или ГЧП уместны.',
    'Поля каждой публикации: title, url, source, publishedAt, name (рабочее название инфоповода), projectName, country, region, industry, grantor (концедент/публичный партнёр), objectType (дорога, мост, кампус, очистные и т.п.), newsStage (announced|design|tender|construction|other), budgetHint, snippet, summary, concessionAngle, nextStep (что сделать финблоку: запросить ТЭО, выйти на концедента, отложить), fit (high|mid|low), score (0-100).',
    'fit=high — явный концессионный/ГЧП сюжет или крупный объект без финансирования; mid — крупное строительство, концессия правдоподобна; low — слабый сигнал, но объект крупный.',
    'Не выдумывай URL и факты: только из переданных сниппетов. Если сниппет не подходит — пропусти.',
    cfg.extraInstructions,
  ]
    .filter(Boolean)
    .join('\n')
}

export function buildMediaPreview(prompt) {
  return buildMediaInstructions(prompt)
}

export const MEDIA_JSON_SCHEMA = {
  publications: [
    {
      title: '',
      url: '',
      source: '',
      publishedAt: '',
      name: '',
      projectName: '',
      country: 'Россия',
      region: '',
      industry: '',
      grantor: '',
      objectType: '',
      newsStage: 'announced',
      budgetHint: '',
      snippet: '',
      summary: '',
      concessionAngle: '',
      nextStep: '',
      fit: 'high',
      score: 0,
    },
  ],
}
