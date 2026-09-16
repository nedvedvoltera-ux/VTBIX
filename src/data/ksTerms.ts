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
] as const

export type ConcessionTermId = (typeof CONCESSION_TERM_ITEMS)[number]['id']

export type ConcessionTermRow = {
  id: ConcessionTermId
  label: string
  value: string
  group?: string
}

function fold(value: string) {
  return value
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9]+/gi, '')
}

const TERM_ALIASES: Record<ConcessionTermId, string[]> = {
  subject: ['subject', 'предмет', 'предметсоглашения'],
  object: ['object', 'объект', 'объектсоглашения', 'объекткс'],
  term: ['term', 'срок', 'срокдействия', 'сроксоглашения'],
  constructionTerm: ['constructionterm', 'срокстроительства', 'критерийконкурса'],
  operationTerm: ['operationterm', 'срокэксплуатации'],
  investmentVolume: ['investmentvolume', 'инвестиции', 'объеминвестиций', 'капекс', 'capex'],
  capitalGrant: ['capitalgrant', 'грант', 'капитальныйгрант'],
  lostRevenue: ['lostrevenue', 'недополученныхдоходов', 'возмещениенедополученных'],
  violatorTravel: ['violatortravel', 'проезднарушителей', 'компенсацияпроезда'],
  concessionFee: ['concessionfee', 'концессионнаяплата', 'платаконцеденту'],
  design: ['design', 'проектирование', 'пир'],
  sitePreparation: ['sitepreparation', 'подготовкатерритории', 'подготовкастроительства'],
  landPlots: ['landplots', 'земельныеучастки', 'зу', 'земельныйучасток'],
  security: ['security', 'обеспечение', 'обеспечениеисполнения'],
  liability: ['liability', 'ответственность', 'неустойки', 'неустойкиконцессионера'],
  terminationCompensation: ['terminationcompensation', 'компенсацияприпрекращении', 'компенсациярасторжения'],
  specialCircumstances: ['specialcircumstances', 'особыеобстоятельства'],
  directAgreement: ['directagreement', 'прямоесоглашение'],
}

export function matchConcessionTermId(raw: string): ConcessionTermId | null {
  const key = fold(raw)
  if (!key) return null
  for (const item of CONCESSION_TERM_ITEMS) {
    if (item.id === raw || fold(item.id) === key || fold(item.label) === key) return item.id
  }
  for (const item of CONCESSION_TERM_ITEMS) {
    if (TERM_ALIASES[item.id].some((alias) => alias === key || (alias.length >= 10 && key.includes(alias)))) {
      return item.id
    }
  }
  return null
}

export function emptyConcessionTerms(): ConcessionTermRow[] {
  return CONCESSION_TERM_ITEMS.map((item) => ({
    id: item.id,
    label: item.label,
    value: '',
    group: 'group' in item ? item.group : undefined,
  }))
}

export function displayConcessionTerms(terms?: { id?: string; label?: string; value?: string }[]): ConcessionTermRow[] {
  const byId = new Map<string, string>()
  for (const row of terms || []) {
    const id = row.id && matchConcessionTermId(row.id) ? matchConcessionTermId(row.id) : row.label ? matchConcessionTermId(row.label) : null
    if (id) byId.set(id, String(row.value || ''))
  }
  return CONCESSION_TERM_ITEMS.map((item) => ({
    id: item.id,
    label: item.label,
    value: byId.get(item.id) || '',
    group: 'group' in item ? item.group : undefined,
  }))
}
