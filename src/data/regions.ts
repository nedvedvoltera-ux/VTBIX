import type {
  AcraOutlook,
  ConcessionFit,
  DebtSustainability,
  FinState,
  RegionRating,
} from '../types'
import { slugify } from '../utils/concession'

const SUBJECTS: [string, string][] = [
  ['Республика Адыгея', 'Южный'],
  ['Республика Алтай', 'Сибирский'],
  ['Республика Башкортостан', 'Приволжский'],
  ['Республика Бурятия', 'Дальневосточный'],
  ['Республика Дагестан', 'Северо-Кавказский'],
  ['Республика Ингушетия', 'Северо-Кавказский'],
  ['Кабардино-Балкарская Республика', 'Северо-Кавказский'],
  ['Республика Калмыкия', 'Южный'],
  ['Карачаево-Черкесская Республика', 'Северо-Кавказский'],
  ['Республика Карелия', 'Северо-Западный'],
  ['Республика Коми', 'Северо-Западный'],
  ['Республика Крым', 'Южный'],
  ['Республика Марий Эл', 'Приволжский'],
  ['Республика Мордовия', 'Приволжский'],
  ['Республика Саха (Якутия)', 'Дальневосточный'],
  ['Республика Северная Осетия — Алания', 'Северо-Кавказский'],
  ['Республика Татарстан', 'Приволжский'],
  ['Республика Тыва', 'Сибирский'],
  ['Удмуртская Республика', 'Приволжский'],
  ['Республика Хакасия', 'Сибирский'],
  ['Чеченская Республика', 'Северо-Кавказский'],
  ['Чувашская Республика', 'Приволжский'],
  ['Алтайский край', 'Сибирский'],
  ['Забайкальский край', 'Дальневосточный'],
  ['Камчатский край', 'Дальневосточный'],
  ['Краснодарский край', 'Южный'],
  ['Красноярский край', 'Сибирский'],
  ['Пермский край', 'Приволжский'],
  ['Приморский край', 'Дальневосточный'],
  ['Ставропольский край', 'Северо-Кавказский'],
  ['Хабаровский край', 'Дальневосточный'],
  ['Амурская область', 'Дальневосточный'],
  ['Архангельская область', 'Северо-Западный'],
  ['Астраханская область', 'Южный'],
  ['Белгородская область', 'Центральный'],
  ['Брянская область', 'Центральный'],
  ['Владимирская область', 'Центральный'],
  ['Волгоградская область', 'Южный'],
  ['Вологодская область', 'Северо-Западный'],
  ['Воронежская область', 'Центральный'],
  ['Ивановская область', 'Центральный'],
  ['Иркутская область', 'Сибирский'],
  ['Калининградская область', 'Северо-Западный'],
  ['Калужская область', 'Центральный'],
  ['Кемеровская область', 'Сибирский'],
  ['Кировская область', 'Приволжский'],
  ['Костромская область', 'Центральный'],
  ['Курганская область', 'Уральский'],
  ['Курская область', 'Центральный'],
  ['Ленинградская область', 'Северо-Западный'],
  ['Липецкая область', 'Центральный'],
  ['Магаданская область', 'Дальневосточный'],
  ['Московская область', 'Центральный'],
  ['Мурманская область', 'Северо-Западный'],
  ['Нижегородская область', 'Приволжский'],
  ['Новгородская область', 'Северо-Западный'],
  ['Новосибирская область', 'Сибирский'],
  ['Омская область', 'Сибирский'],
  ['Оренбургская область', 'Приволжский'],
  ['Орловская область', 'Центральный'],
  ['Пензенская область', 'Приволжский'],
  ['Псковская область', 'Северо-Западный'],
  ['Ростовская область', 'Южный'],
  ['Рязанская область', 'Центральный'],
  ['Самарская область', 'Приволжский'],
  ['Саратовская область', 'Приволжский'],
  ['Сахалинская область', 'Дальневосточный'],
  ['Свердловская область', 'Уральский'],
  ['Смоленская область', 'Центральный'],
  ['Тамбовская область', 'Центральный'],
  ['Тверская область', 'Центральный'],
  ['Томская область', 'Сибирский'],
  ['Тульская область', 'Центральный'],
  ['Тюменская область', 'Уральский'],
  ['Ульяновская область', 'Приволжский'],
  ['Челябинская область', 'Уральский'],
  ['Ярославская область', 'Центральный'],
  ['Москва', 'Центральный'],
  ['Санкт-Петербург', 'Северо-Западный'],
  ['Севастополь', 'Южный'],
  ['Еврейская автономная область', 'Дальневосточный'],
  ['Ненецкий автономный округ', 'Северо-Западный'],
  ['Ханты-Мансийский автономный округ — Югра', 'Уральский'],
  ['Чукотский автономный округ', 'Дальневосточный'],
  ['Ямало-Ненецкий автономный округ', 'Уральский'],
]

const ACRA = ['AAA(RU)', 'AA+(RU)', 'AA(RU)', 'AA-(RU)', 'A+(RU)', 'A(RU)', 'A-(RU)', 'BBB+(RU)', 'BBB(RU)', 'BBB-(RU)']

export const DEBT_LABEL: Record<DebtSustainability, string> = {
  high: 'Высокий',
  mid: 'Средний',
  low: 'Низкий',
}

export const FIN_LABEL: Record<FinState, string> = {
  good: 'Хорошее',
  mid: 'Среднее',
  bad: 'Плохое',
}

export const FIT_LABEL: Record<ConcessionFit, string> = {
  advantageous: 'Выгодно',
  average: 'Средне',
  unfavorable: 'Невыгодно',
}

export const OUTLOOK_LABEL: Record<AcraOutlook, string> = {
  positive: 'Позитивный',
  stable: 'Стабильный',
  negative: 'Негативный',
  developing: 'Развивающийся',
}

export const FEDERAL_DISTRICTS = [
  'Центральный',
  'Северо-Западный',
  'Южный',
  'Северо-Кавказский',
  'Приволжский',
  'Уральский',
  'Сибирский',
  'Дальневосточный',
] as const

function hash(value: string): number {
  let h = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function inn(seed: number): string {
  return String(7700000000 + (seed % 22999999)).padStart(10, '0')
}

function buildRegion(subject: string, federalDistrict: string): RegionRating {
  const h = hash(subject)
  const h2 = hash(`${subject}-fin`)
  const rich =
    subject === 'Москва' ||
    subject === 'Санкт-Петербург' ||
    subject.includes('Тюменская') ||
    subject.includes('Югра') ||
    subject.includes('Ямало') ||
    subject.includes('Татарстан') ||
    subject.includes('Сахалин') ||
    subject.includes('Московская')
  const weak =
    federalDistrict === 'Северо-Кавказский' ||
    subject.includes('Тыва') ||
    subject.includes('Ингушетия') ||
    subject.includes('Калмыкия') ||
    subject.includes('Еврейская') ||
    subject.includes('Курганская')

  const ownRevenueShare2025 = rich ? 72 + (h % 18) : weak ? 28 + (h % 16) : 48 + (h % 24)
  const debtToOwnRevenue = rich ? 8 + (h % 18) : weak ? 48 + (h % 38) : 22 + (h % 36)
  const commercialDebtShare = rich ? 2 + (h % 8) : weak ? 18 + (h % 22) : 7 + (h % 16)

  const acraIndex = rich ? h % 3 : weak ? 7 + (h % 3) : 3 + (h % 5)
  const acra2025 = ACRA[Math.min(acraIndex, ACRA.length - 1)]
  const acra2024 = ACRA[Math.min(acraIndex + (h % 2), ACRA.length - 1)]

  const debtSustain2526: DebtSustainability = debtToOwnRevenue < 30 ? 'high' : debtToOwnRevenue < 55 ? 'mid' : 'low'
  const debtSustain2425: DebtSustainability =
    debtToOwnRevenue - 4 < 30 ? 'high' : debtToOwnRevenue - 4 < 55 ? 'mid' : 'low'

  const finState: FinState =
    ownRevenueShare2025 >= 65 && debtToOwnRevenue <= 32 && debtSustain2526 === 'high'
      ? 'good'
      : ownRevenueShare2025 < 42 || debtToOwnRevenue > 62 || debtSustain2526 === 'low'
        ? 'bad'
        : 'mid'

  const concessionFit: ConcessionFit =
    finState === 'good' && commercialDebtShare < 12
      ? 'advantageous'
      : finState === 'bad' || commercialDebtShare > 28
        ? 'unfavorable'
        : 'average'

  const outlookRoll = h % 10
  const acraOutlook: AcraOutlook =
    outlookRoll > 7 ? 'positive' : outlookRoll < 2 ? 'negative' : outlookRoll === 3 ? 'developing' : 'stable'

  const scale = rich ? 420 + (h % 1800) : weak ? 38 + (h % 70) : 95 + (h % 280)
  const moscowBoost = subject === 'Москва' ? 2800 : subject === 'Санкт-Петербург' ? 900 : 0
  const revenuesTotal = scale + moscowBoost
  const revenuesOwn = (revenuesTotal * ownRevenueShare2025) / 100
  const revenuesGrants = revenuesTotal - revenuesOwn
  const debtTotal = (revenuesOwn * debtToOwnRevenue) / 100

  const commShare = 0.12 + (h % 18) / 100
  const budgetShare = 0.42 + (h2 % 16) / 100
  const bankShare = 0.08 + (h % 10) / 100
  const paperShare = 0.1 + (h2 % 12) / 100
  const guarShare = 0.04 + (h % 6) / 100
  const muniShare = 0.06 + (h2 % 8) / 100
  const rest = Math.max(0.04, 1 - commShare - budgetShare - bankShare - paperShare - guarShare - muniShare)

  return {
    id: slugify(subject),
    subject,
    federalDistrict,
    innExecutive: inn(h),
    innFinance: inn(h2),
    debtSustain2425,
    debtSustain2526,
    acra2024,
    acra2025,
    acraOutlook,
    acraDate: '17.03.2026',
    ownRevenueShare2025: Number(ownRevenueShare2025.toFixed(1)),
    debtToOwnRevenue: Number(debtToOwnRevenue.toFixed(1)),
    commercialDebtShare: Number(commercialDebtShare.toFixed(1)),
    finState,
    concessionFit,
    revenuesTotal: Number(revenuesTotal.toFixed(1)),
    revenuesGrants: Number(revenuesGrants.toFixed(1)),
    revenuesOwn: Number(revenuesOwn.toFixed(1)),
    debtTotal: Number(debtTotal.toFixed(1)),
    debtCommercial: Number((debtTotal * commShare).toFixed(1)),
    debtBudgetLoans: Number((debtTotal * budgetShare).toFixed(1)),
    debtBankLoans: Number((debtTotal * bankShare).toFixed(1)),
    debtSecurities: Number((debtTotal * paperShare).toFixed(1)),
    debtGuarantees: Number((debtTotal * guarShare).toFixed(1)),
    debtMunicipalZone: Number((debtTotal * muniShare).toFixed(1)),
    debtRedZone: Number((debtTotal * rest).toFixed(1)),
  }
}

export const REGION_RATINGS: RegionRating[] = SUBJECTS.map(([subject, fd]) => buildRegion(subject, fd)).sort((a, b) => {
  const order: Record<ConcessionFit, number> = { advantageous: 0, average: 1, unfavorable: 2 }
  if (order[a.concessionFit] !== order[b.concessionFit]) return order[a.concessionFit] - order[b.concessionFit]
  return a.subject.localeCompare(b.subject, 'ru')
})

export function getRegionById(id: string): RegionRating | undefined {
  return REGION_RATINGS.find((item) => item.id === id)
}
