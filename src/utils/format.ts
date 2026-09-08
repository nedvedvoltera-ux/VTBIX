import type { ExtractedFields } from '../types'

const TEMPLATES: { test: RegExp; data: ExtractedFields }[] = [
  {
    test: /энерг|тэц|гэс|турбин|тепло/i,
    data: {
      name: 'Модернизация генерирующего объекта',
      industry: 'Энергетика',
      country: 'Россия',
      region: 'Новосибирская область',
      budget: 11_200_000_000,
    },
  },
  {
    test: /логист|хаб|порт|склад|терминал/i,
    data: {
      name: 'Логистический комплекс',
      industry: 'Логистика',
      country: 'Россия',
      region: 'Приморский край',
      budget: 7_400_000_000,
    },
  },
  {
    test: /агро|элеватор|ферм|сельхоз|чернозем/i,
    data: {
      name: 'Агропромышленный комплекс',
      industry: 'АПК',
      country: 'Россия',
      region: 'Воронежская область',
      budget: 3_800_000_000,
    },
  },
  {
    test: /цод|дата|data|dc_|сервер/i,
    data: {
      name: 'Центр обработки данных',
      industry: 'IT и ЦОД',
      country: 'Россия',
      region: 'Мурманская область',
      budget: 9_100_000_000,
    },
  },
  {
    test: /фарм|лекар|gmp|медиц/i,
    data: {
      name: 'Фармацевтическое производство',
      industry: 'Фармацевтика',
      country: 'Россия',
      region: 'Республика Татарстан',
      budget: 4_600_000_000,
    },
  },
  {
    test: /гок|руда|уголь|шахт|добыч/i,
    data: {
      name: 'Горно-обогатительный комбинат',
      industry: 'Добыча',
      country: 'Россия',
      region: 'Кемеровская область',
      budget: 21_500_000_000,
    },
  },
  {
    test: /казах|астан|алмат|тенге/i,
    data: {
      name: 'Инфраструктурный проект',
      industry: 'Логистика',
      country: 'Казахстан',
      region: 'Астана',
      budget: 8_200_000_000,
    },
  },
]

const FALLBACK: ExtractedFields = {
  name: 'Инвестиционный проект',
  industry: 'Строительство',
  country: 'Россия',
  region: 'Москва',
  budget: 5_000_000_000,
}

export function extractFromUpload(fileName: string, notes: string): ExtractedFields {
  const haystack = `${fileName} ${notes}`
  const hit = TEMPLATES.find((item) => item.test.test(haystack))
  const base = hit ? { ...hit.data } : { ...FALLBACK }

  if (/татар|казан/i.test(haystack)) {
    base.country = 'Россия'
    base.region = 'Республика Татарстан'
  }
  if (/примор|владивосток/i.test(haystack)) {
    base.region = 'Приморский край'
  }
  if (/беларус|минск/i.test(haystack)) {
    base.country = 'Беларусь'
    base.region = 'Минск'
  }

  const budgetMatch = haystack.match(/(\d+[.,]?\d*)\s*(млрд|млн)/i)
  if (budgetMatch) {
    const raw = Number(budgetMatch[1].replace(',', '.'))
    base.budget = budgetMatch[2].toLowerCase() === 'млрд' ? raw * 1_000_000_000 : raw * 1_000_000
  }

  const named = fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim()
  if (named.length > 3 && named.length < 80) {
    base.name = named
  }

  return base
}

export function formatBudget(value: number | null): string {
  if (value == null || Number.isNaN(value)) return '—'
  const billions = value / 1_000_000_000
  if (billions >= 1) {
    return `${billions.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} млрд ₽`
  }
  const millions = value / 1_000_000
  return `${millions.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} млн ₽`
}

export function formatBytes(bytes: number | null): string {
  if (!bytes) return '—'
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} КБ`
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function uid(prefix = 'p'): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`
}
