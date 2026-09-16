import type { MediaPromptConfig } from '../types'

export const DEFAULT_MEDIA_PROMPT: MediaPromptConfig = {
  role:
    'Ты аналитик финансового блока. По публикациям в СМИ ищешь крупные строительные и инфраструктурные проекты в России и СНГ, куда банк мог бы предложить концессию или ГЧП. Отсекай мелкий ремонт, жилую точечную застройку без публичного партнёра и чистую политику без объекта.',
  extraInstructions:
    'В концессионном угле укажи, кто публичный партнёр, какой объект, есть ли намёк на частные инвестиции, платность, эксплуатацию или нехватку бюджета. Если в тексте нет объекта — не включай публикацию.',
  keywords: [
    'концессия',
    'ГЧП',
    'инфраструктурный проект',
    'крупное строительство',
    'платная дорога',
    'транспортная инфраструктура',
    'очистные сооружения',
    'мусороперерабатывающий завод',
  ],
  sites: ['interfax.ru', 'tass.ru', 'ria.ru', 'kommersant.ru', 'rbc.ru', 'vedomosti.ru', 'rg.ru', 'iz.ru'],
  searchMode: 'sites',
  language: 'ru',
  lookbackDays: 14,
  maxResults: 12,
}

export function normalizeDomain(raw: string) {
  const value = raw.trim()
  if (!value) return ''
  const withProto = /^https?:\/\//i.test(value) ? value : `https://${value}`
  try {
    return new URL(withProto).hostname.replace(/^www\./i, '').toLowerCase()
  } catch {
    return value.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0].trim().toLowerCase()
  }
}

export function buildMediaPreview(prompt: MediaPromptConfig) {
  const lang = prompt.language === 'en' ? 'English' : 'русском'
  const mode =
    prompt.searchMode === 'web'
      ? 'поиск по открытому вебу'
      : `поиск только по сайтам: ${prompt.sites.join(', ') || 'список пуст'}`
  return [
    prompt.role,
    `Ответ пиши на ${lang}.`,
    `Источник: ${mode}. Ключевые слова: ${prompt.keywords.join(', ') || 'не заданы'}.`,
    'Верни ТОЛЬКО JSON. В publications — только материалы, где есть крупный строительный/инфраструктурный объект и хотя бы намёк, что концессия или ГЧП уместны.',
    'Поля: title, url, source, publishedAt, name, projectName, country, region, industry, grantor, objectType, newsStage, budgetHint, snippet, summary, concessionAngle, nextStep, fit, score.',
    prompt.extraInstructions,
  ]
    .filter(Boolean)
    .join('\n\n')
}
