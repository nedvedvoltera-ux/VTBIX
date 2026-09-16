import type { MetricWeight, Project, PromptConfig, PromptSectionId } from '../types'
import { normalizeMetrics } from '../utils/concession'

export const INDUSTRIES = [
  'Энергетика',
  'Логистика',
  'АПК',
  'IT и ЦОД',
  'Фармацевтика',
  'Добыча',
  'Строительство',
  'Транспорт',
] as const

export const COUNTRIES = ['Россия', 'Казахстан', 'Беларусь'] as const

export const REGIONS_BY_COUNTRY: Record<string, string[]> = {
  Россия: [
    'Москва',
    'Санкт-Петербург',
    'Новосибирская область',
    'Приморский край',
    'Воронежская область',
    'Республика Татарстан',
    'Кемеровская область',
    'Мурманская область',
    'Краснодарский край',
    'Свердловская область',
  ],
  Казахстан: ['Алматы', 'Астана', 'Карагандинская область', 'Атырауская область'],
  Беларусь: ['Минск', 'Брестская область', 'Гомельская область'],
}

export const BUDGET_FILTERS = [
  { id: 'lt1', label: 'до 1 млрд ₽', min: 0, max: 1_000_000_000 },
  { id: '1to5', label: '1–5 млрд ₽', min: 1_000_000_000, max: 5_000_000_000 },
  { id: '5to20', label: '5–20 млрд ₽', min: 5_000_000_000, max: 20_000_000_000 },
  { id: 'gt20', label: 'свыше 20 млрд ₽', min: 20_000_000_000, max: Infinity },
] as const

export const FIT_FILTERS = [
  { id: 'all', label: 'Все по выгоде' },
  { id: 'advantageous', label: 'Выгодно' },
  { id: 'average', label: 'Средне' },
  { id: 'unfavorable', label: 'Невыгодно' },
] as const

export const STATUS_FILTERS = [
  { id: 'all', label: 'Все' },
  { id: 'draft', label: 'Черновик' },
  { id: 'queued', label: 'В очереди' },
  { id: 'processing', label: 'Расчёт' },
  { id: 'ready', label: 'Готово' },
  { id: 'error', label: 'Ошибка' },
] as const

export const INFOVOD_DECISION_FILTERS = [
  { id: 'all', label: 'Все решения' },
  { id: 'new', label: 'Новые' },
  { id: 'watch', label: 'На контроле' },
  { id: 'pursue', label: 'В работу' },
  { id: 'project', label: 'Объект заведён' },
  { id: 'dismissed', label: 'Отклонены' },
] as const

export const INFOVOD_FIT_FILTERS = [
  { id: 'all', label: 'Все по сигналу' },
  { id: 'high', label: 'Сильный' },
  { id: 'mid', label: 'Возможен КС' },
  { id: 'low', label: 'Слабый' },
] as const

export const CRM_STAGES = [
  { id: 'lead', label: 'Новый' },
  { id: 'contact', label: 'Контакт' },
  { id: 'meeting', label: 'Встреча' },
  { id: 'offer', label: 'Предложение' },
  { id: 'negotiation', label: 'Переговоры' },
  { id: 'won', label: 'Сделка' },
  { id: 'lost', label: 'Отказ' },
  { id: 'hold', label: 'Пауза' },
] as const

export const CRM_STAGE_FILTERS = [{ id: 'all', label: 'Все стадии' }, ...CRM_STAGES] as const

export const CRM_SOURCE_FILTERS = [
  { id: 'all', label: 'Все поводы' },
  { id: 'project', label: 'Объект анализа' },
  { id: 'infovod', label: 'Инфоповод' },
] as const

export const CRM_TOUCH_KINDS = [
  { id: 'meeting', label: 'Встреча' },
  { id: 'call', label: 'Звонок' },
  { id: 'email', label: 'Письмо' },
  { id: 'note', label: 'Заметка' },
  { id: 'other', label: 'Другое' },
] as const

export const PROMPT_SECTIONS: { id: PromptSectionId; title: string; hint: string }[] = [
  { id: 'executive', title: 'Резюме для руководства', hint: '1 страница: суть, цифры, рекомендация' },
  { id: 'description', title: 'Описание проекта', hint: 'что строится, сроки; оценка закона, ПД/ЗУ и выгодности для инвестора' },
  { id: 'industry', title: 'Отраслевой контекст', hint: 'рынок, конкуренция, регуляторика' },
  { id: 'location', title: 'Локация и инфраструктура', hint: 'страна, регион, логистика, кадры' },
  { id: 'budget', title: 'Бюджет и структура затрат', hint: 'CAPEX/OPEX, источники финансирования' },
  { id: 'financials', title: 'Финансовая модель', hint: 'NPV, IRR, DPP, WACC, чувствительность' },
  { id: 'scenarios', title: 'Сценарный анализ', hint: 'базовый / оптимистичный / стресс' },
  { id: 'risks', title: 'Риски', hint: 'матрица вероятность × влияние' },
  { id: 'comparables', title: 'Сравнение с аналогами', hint: 'benchmark по отрасли и региону' },
  { id: 'esg', title: 'ESG и комплаенс', hint: 'экология, социальные эффекты, санкционный контур' },
  { id: 'recommendation', title: 'Инвестиционная рекомендация', hint: 'инвестировать / доработать / отклонить' },
]

export const DEFAULT_METRICS: MetricWeight[] = normalizeMetrics([
  { name: 'NPV', weight: 25 },
  { name: 'IRR', weight: 25 },
  { name: 'DPP', weight: 15 },
  { name: 'WACC', weight: 10 },
  { name: 'EBITDA margin', weight: 15 },
  { name: 'DSCR', weight: 10 },
])

export const DEFAULT_PROMPT: PromptConfig = {
  role: 'Старший финансовый аналитик инвестиционного комитета. Готовишь служебную аналитическую записку для финансового отдела: без маркетинга, с проверяемыми допущениями и явными пробелами в исходных данных.',
  language: 'ru',
  tone: 'formal',
  depth: 'standard',
  sections: {
    executive: true,
    description: true,
    industry: true,
    location: true,
    budget: true,
    financials: true,
    scenarios: true,
    risks: true,
    comparables: true,
    esg: false,
    recommendation: true,
  },
  metrics: DEFAULT_METRICS.map((item) => ({ ...item })),
  useEmployeeNotes: true,
  includeComparables: true,
  includeEsg: false,
  outputFormat: 'memo',
  recommendationStyle: 'traffic',
  extraInstructions:
    'Карточка КС важнее длинной записки. Сначала заполни terms по ключам (subject, object, term, constructionTerm, operationTerm, investmentVolume, capitalGrant, lostRevenue, violatorTravel, concessionFee, design, sitePreparation, landPlots, security, liability, terminationCompensation, specialCircumstances, directAgreement) только из Markdown. Три поля концедента не сливай. Описание проекта обязательно включает: императивные нормы закона; реалистичность при отсутствии/наличии ПД и ЗУ; финансовую целесообразность для инвестора. Баланс рисков — фраза «Проект КС представляется относительно сбалансированным по распределению рисков, за исключением условий о …».',
}

export const INITIAL_PROJECTS: Project[] = [
  {
    id: 'p-tec5',
    name: 'Модернизация ТЭЦ-5',
    fileName: 'TETs-5_finmodel_v4.xlsx',
    fileSize: 4_812_000,
    notes: 'Приоритет — замена турбины №3. Срок окупаемости критичен для инвесткомитета в октябре.',
    industry: 'Энергетика',
    country: 'Россия',
    region: 'Новосибирская область',
    budget: 12_400_000_000,
    status: 'ready',
    progress: 100,
    createdAt: '2026-08-12T09:10:00.000Z',
    updatedAt: '2026-09-04T14:22:00.000Z',
    extractedByLlm: true,
    owner: 'Е. Соколова',
    recommendation: 'revise',
    score: 72,
    concessionFit: 'average',
    concessionScore: 72,
    note: {
      executiveSummary:
        'Проект модернизации ТЭЦ-5 рассчитан на 12,4 млрд ₽ CAPEX. Базовый NPV положительный, но чувствителен к тарифу на тепло и графику остановов. Рекомендуется доработать модель по OPEX после 2029 года и зафиксировать источник софинансирования региона.',
      description:
        'Замена турбоагрегата №3, реконструкция тепловых сетей на выходе и установка системы учёта. Срок реализации — 34 месяца. Инициатор — региональная генерирующая компания.',
      industryContext:
        'Сибирский рынок тепла остаётся регулируемым. Индексация тарифа 4–6% не покрывает скачок стоимости оборудования. Конкуренция со стороны мини-ТЭЦ промышленного кластера умеренная.',
      location:
        'Новосибирская область, площадка действующей ТЭЦ. Инфраструктура подключения есть, логистика оборудования — через ст. Инская. Кадровый резерв цеха турбин оценивается как достаточный.',
      budgetBreakdown:
        'CAPEX 12,4 млрд ₽: оборудование 61%, СМР 22%, ПИР и управление 9%, резерв 8%. OPEX после ввода — +1,1 млрд ₽/год к текущему уровню за счёт сервиса импортных узлов.',
      financials: [
        { metric: 'NPV', value: '1,8 млрд ₽', comment: 'WACC 12,4%, горизонт 15 лет', score: 76 },
        { metric: 'IRR', value: '14,1%', comment: 'ниже целевых 15% инвестполитики', score: 68 },
        { metric: 'DPP', value: '9,6 лет', comment: 'критично для комитета', score: 58 },
        { metric: 'DSCR', value: '1,18', comment: 'в 2030–31 близко к ковенанте 1,2', score: 70 },
      ],
      scenarios: [
        { name: 'Базовый', npv: '1,8 млрд ₽', irr: '14,1%' },
        { name: 'Оптимистичный (тариф +1,5 п.п.)', npv: '3,4 млрд ₽', irr: '16,0%' },
        { name: 'Стресс (сдвиг ввода +12 мес.)', npv: '−0,4 млрд ₽', irr: '11,2%' },
      ],
      risks: [
        { title: 'Срыв поставки турбины', level: 'high', text: 'Единственный квалифицированный поставщик, санкционный контур.' },
        { title: 'Тарифное решение', level: 'mid', text: 'Решение РЭК не зафиксировано на горизонте 5 лет.' },
        { title: 'Остановы смежных блоков', level: 'low', text: 'График согласован с СО ЕЭС.' },
      ],
      recommendation:
        'Доработать. Не выносить на комитет до фиксации источника 2,1 млрд ₽ софинансирования и стресс-теста по валютной составляющей оборудования.',
    },
  },
  {
    id: 'p-vostok',
    name: 'Логистический хаб «Восток»',
    fileName: 'Hub_Vostok_BP.pdf',
    fileSize: 8_240_000,
    notes: 'Смотреть синергию с портом. Есть письмо о намерениях от 3 якорных грузоотправителей.',
    industry: 'Логистика',
    country: 'Россия',
    region: 'Приморский край',
    budget: 18_750_000_000,
    status: 'processing',
    progress: 64,
    createdAt: '2026-09-01T08:00:00.000Z',
    updatedAt: '2026-09-08T06:40:00.000Z',
    extractedByLlm: true,
    owner: 'М. Ким',
    concessionFit: 'advantageous',
    concessionScore: 81,
  },
  {
    id: 'p-chernozem',
    name: 'Агрокомплекс «Черноземье»',
    fileName: 'Agro_Chernozemie.xlsx',
    fileSize: 2_105_000,
    notes: 'Уточнить субсидии Минсельхоза. Пояснение: элеватор уже в периметре, в модели его стоимость задвоилась.',
    industry: 'АПК',
    country: 'Россия',
    region: 'Воронежская область',
    budget: 6_200_000_000,
    status: 'queued',
    progress: 0,
    createdAt: '2026-09-06T11:15:00.000Z',
    updatedAt: '2026-09-07T16:02:00.000Z',
    extractedByLlm: true,
    owner: 'А. Петров',
    concessionFit: 'average',
    concessionScore: 66,
  },
  {
    id: 'p-north-dc',
    name: 'ЦОД «Север»',
    fileName: 'DC_Sever_model.xlsx',
    fileSize: 3_440_000,
    notes: 'Якорный клиент — госконтур. Нужна оценка PUE и стоимости электроэнергии Колэнерго.',
    industry: 'IT и ЦОД',
    country: 'Россия',
    region: 'Мурманская область',
    budget: 9_850_000_000,
    status: 'ready',
    progress: 100,
    createdAt: '2026-07-22T10:00:00.000Z',
    updatedAt: '2026-08-28T12:11:00.000Z',
    extractedByLlm: true,
    owner: 'Е. Соколова',
    recommendation: 'invest',
    score: 84,
    concessionFit: 'advantageous',
    concessionScore: 84,
    note: {
      executiveSummary:
        'ЦОД 24 МВт IT-нагрузки в Мурманской области. Холодный климат снижает OPEX на охлаждение. NPV 4,1 млрд ₽ при загрузке 70% к 4-му году. Рекомендация: инвестировать при условии контракта take-or-pay на 40% мощности.',
      description:
        'Двухэтапный ввод: 12 МВт в 2028 и 12 МВт в 2030. Уровень отказоустойчивости — TIER III. Площадка рядом с ПС 330 кВ.',
      industryContext:
        'Спрос на размещение в РФ превышает предложение в Северо-Западном кластере. Ставки colocation устойчивы. Риски — импорт серверного оборудования и квоты на энергоприсоединение.',
      location:
        'Мурманская область. Климатический бонус к PUE (цель 1,18). Логистика оборудования сложнее московского кластера, но земля и энергия дешевле.',
      budgetBreakdown:
        '9,85 млрд ₽: инженерия и энергия 44%, строительная часть 28%, ИБП и охлаждение 18%, прочее 10%.',
      financials: [
        { metric: 'NPV', value: '4,1 млрд ₽', comment: 'WACC 13%', score: 88 },
        { metric: 'IRR', value: '18,4%', comment: 'выше hurdle 15%', score: 90 },
        { metric: 'DPP', value: '6,2 года', comment: 'при 70% загрузки', score: 82 },
        { metric: 'EBITDA margin', value: '41%', comment: 'на горизонте стабилизации', score: 86 },
      ],
      scenarios: [
        { name: 'Базовый', npv: '4,1 млрд ₽', irr: '18,4%' },
        { name: 'Якорь 60% take-or-pay', npv: '5,6 млрд ₽', irr: '20,1%' },
        { name: 'Загрузка 45%', npv: '0,7 млрд ₽', irr: '13,6%' },
      ],
      risks: [
        { title: 'Срыв якорного контракта', level: 'high', text: 'Без take-or-pay экономика падает ниже hurdle.' },
        { title: 'Тариф на электроэнергию', level: 'mid', text: 'Доля энергии в OPEX выше 30%.' },
        { title: 'Кадровый голод', level: 'low', text: 'Компенсируется вахтовым форматом.' },
      ],
      recommendation: 'Инвестировать. Вынести на комитет после юридической проверки take-or-pay.',
    },
  },
  {
    id: 'p-pharma-kzn',
    name: 'Фармацевтический завод, Казань',
    fileName: 'Pharma_Kazan.docx',
    fileSize: 1_880_000,
    notes: 'Лицензия Минздрава в приложении 4. Проверить GMP-график.',
    industry: 'Фармацевтика',
    country: 'Россия',
    region: 'Республика Татарстан',
    budget: 4_350_000_000,
    status: 'ready',
    progress: 100,
    createdAt: '2026-06-18T09:40:00.000Z',
    updatedAt: '2026-08-02T18:20:00.000Z',
    extractedByLlm: true,
    owner: 'Н. Фадеева',
    recommendation: 'invest',
    score: 79,
    concessionFit: 'advantageous',
    concessionScore: 79,
    note: {
      executiveSummary:
        'Завод готовых лекарственных форм, 4,35 млрд ₽. Маржа устойчива за счёт контрактного производства. Рекомендация положительная при сохранении графика GMP-сертификации.',
      description:
        'Площадка ОЭЗ «Алабуга»-смежный кластер. Мощность — 120 млн упаковок/год. Старт выпуска — 2кв 2028.',
      industryContext:
        'Локализация препаратов перечня ЖНВЛП поддерживается регулятором. Ценовая регуляция ограничивает upside, но даёт предсказуемый спрос.',
      location:
        'Республика Татарстан. Кадры фармкластера доступны. Логистика субстанций — через ж/д узел Казани.',
      budgetBreakdown:
        'Оборудование чистых помещений 48%, строительство 27%, валидация и квалификация 11%, оборотный капитал запуска 14%.',
      financials: [
        { metric: 'NPV', value: '2,2 млрд ₽', comment: 'WACC 11,8%', score: 82 },
        { metric: 'IRR', value: '17,0%', comment: 'базовый сценарий', score: 84 },
        { metric: 'DPP', value: '7,1 года', comment: '', score: 74 },
      ],
      scenarios: [
        { name: 'Базовый', npv: '2,2 млрд ₽', irr: '17,0%' },
        { name: 'Задержка GMP +9 мес.', npv: '1,1 млрд ₽', irr: '14,2%' },
      ],
      risks: [
        { title: 'GMP-сертификация', level: 'mid', text: 'Исторически срывы на 6–12 месяцев.' },
        { title: 'Валютные субстанции', level: 'mid', text: '40% себестоимости в валюте.' },
      ],
      recommendation: 'Инвестировать. Контрольная точка — получение GMP до выплаты 3-го транша.',
    },
  },
  {
    id: 'p-gok',
    name: 'ГОК «Кузнецкий»',
    fileName: 'GOK_Kuznetsky_v2.xlsx',
    fileSize: 6_010_000,
    notes: '',
    industry: 'Добыча',
    country: 'Россия',
    region: 'Кемеровская область',
    budget: 27_600_000_000,
    status: 'error',
    progress: 22,
    createdAt: '2026-09-03T07:55:00.000Z',
    updatedAt: '2026-09-05T19:01:00.000Z',
    extractedByLlm: true,
    owner: 'А. Петров',
    concessionFit: 'unfavorable',
    concessionScore: 41,
  },
  {
    id: 'p-astana-hub',
    name: 'Сухой порт Астана',
    fileName: 'DryPort_Astana.pdf',
    fileSize: 5_500_000,
    notes: 'Валюта модели — тенге. Пересчитать в рубли по курсу на дату комитета.',
    industry: 'Логистика',
    country: 'Казахстан',
    region: 'Астана',
    budget: 8_900_000_000,
    status: 'processing',
    progress: 38,
    createdAt: '2026-09-05T13:20:00.000Z',
    updatedAt: '2026-09-08T04:12:00.000Z',
    extractedByLlm: true,
    owner: 'М. Ким',
    concessionFit: 'average',
    concessionScore: 61,
  },
  {
    id: 'p-minsk-plant',
    name: 'Сборочное производство, Минск',
    fileName: null,
    fileSize: null,
    notes: 'Ждём финансовую модель от инициатора. Пока только ТЭО.',
    industry: 'Машиностроение',
    country: 'Беларусь',
    region: 'Минск',
    budget: 2_150_000_000,
    status: 'draft',
    progress: 0,
    createdAt: '2026-09-07T15:00:00.000Z',
    updatedAt: '2026-09-07T15:00:00.000Z',
    extractedByLlm: false,
    owner: 'Н. Фадеева',
  },
]

export const SEED_PROJECT_IDS = new Set(INITIAL_PROJECTS.map((item) => item.id))
