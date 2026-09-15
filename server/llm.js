const TEMPLATES = [
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

const FALLBACK = {
  name: 'Инвестиционный проект',
  industry: 'Строительство',
  country: 'Россия',
  region: 'Москва',
  budget: 5_000_000_000,
}

export function extractFromUpload(fileName, notes) {
  const haystack = `${fileName} ${notes}`
  const hit = TEMPLATES.find((item) => item.test.test(haystack))
  const base = hit ? { ...hit.data } : { ...FALLBACK }

  if (/татар|казан/i.test(haystack)) {
    base.country = 'Россия'
    base.region = 'Республика Татарстан'
  }
  if (/примор|владивосток/i.test(haystack)) base.region = 'Приморский край'
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
  if (named.length > 3 && named.length < 80) base.name = named
  return base
}

function deriveConcession(score, recommendation) {
  if (score == null && !recommendation) return {}
  const concessionScore = score ?? (recommendation === 'invest' ? 82 : recommendation === 'revise' ? 64 : 42)
  const concessionFit = concessionScore >= 78 ? 'advantageous' : concessionScore >= 58 ? 'average' : 'unfavorable'
  return { concessionScore, concessionFit }
}

export async function runLlmExtraction({ fileName, notes, prompt }) {
  // Задел под реальную модель: если задан LLM_API_URL, сюда пойдёт запрос.
  // Пока эвристика по имени файла и пояснениям — тот же контракт, что сохранит LLM.
  const provider = process.env.LLM_API_URL
  if (provider) {
    const response = await fetch(`${provider.replace(/\/$/, '')}/v1/extract`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.LLM_API_KEY ? { Authorization: `Bearer ${process.env.LLM_API_KEY}` } : {}),
      },
      body: JSON.stringify({ fileName, notes, prompt }),
    })
    if (!response.ok) {
      throw new Error(`LLM ${response.status}`)
    }
    return response.json()
  }

  await new Promise((resolve) => setTimeout(resolve, 800))
  const extracted = extractFromUpload(fileName, notes || '')
  return {
    provider: 'heuristic-stub',
    extracted,
    model: 'vtbih-extract-stub',
  }
}

function metricList(prompt) {
  const raw = Array.isArray(prompt?.metrics) ? prompt.metrics : []
  return raw
    .map((item) => (typeof item === 'string' ? { name: item, weight: 10 } : item))
    .filter((item) => item?.name)
}

export function buildReadyNote(project, prompt) {
  const metrics = metricList(prompt)
  const names = metrics.length ? metrics.map((item) => item.name) : ['NPV', 'IRR']
  const seed = project.score ?? 70
  return {
    executiveSummary: `Автоматический расчёт по «${project.name}» завершён. Бюджет ${
      project.budget ? `${(project.budget / 1_000_000_000).toFixed(1)} млрд ₽` : 'не указан'
    }. Требуется сверка допущений аналитиком.`,
    description: project.notes || 'Описание собрано из загруженного файла. Требуется валидация сотрудником.',
    industryContext: `Отрасль: ${project.industry}. Контекст рынка подставлен из отраслевого справочника.`,
    location: [project.country, project.region].filter(Boolean).join(', '),
    budgetBreakdown: 'Структура CAPEX восстановлена укрупнённо. Детализация — в исходном файле.',
    financials: names.map((name, index) => ({
      metric: name,
      value: 'расчёт выполнен',
      comment: 'результат обработки',
      score: Math.max(40, Math.min(95, seed - 6 + index * 3 + Math.round(Math.random() * 8))),
    })),
    scenarios: [
      { name: 'Базовый', npv: 'положительный', irr: 'около hurdle' },
      { name: 'Стресс', npv: 'на границе', irr: 'ниже hurdle' },
    ],
    risks: [
      { title: 'Качество исходных данных', level: 'mid', text: 'Часть полей извлечена моделью автоматически.' },
    ],
    recommendation: 'Доработать: сверить извлечённые поля и пояснения перед выносом на комитет.',
  }
}

export function completeProcessing(project, prompt) {
  const score = project.score ?? 70 + Math.round(Math.random() * 15)
  const recommendation = project.recommendation ?? 'revise'
  return {
    ...project,
    progress: 100,
    status: 'ready',
    updatedAt: new Date().toISOString(),
    recommendation,
    score,
    ...deriveConcession(score, recommendation),
    note: project.note ?? buildReadyNote({ ...project, score, recommendation }, prompt),
  }
}
