import type { CrmActivity, CrmContact, CrmDeal, CrmPlan, CrmStage } from '../types'

const DEMO_KEY = 'vtbih.crmDemo'

function at(days: number, hours = 10) {
  const date = new Date()
  date.setHours(hours, 0, 0, 0)
  date.setDate(date.getDate() + days)
  return date.toISOString()
}

function contact(partial: Partial<CrmContact> & { name: string }): CrmContact {
  return {
    id: partial.id || `demo-c-${partial.name.slice(0, 8)}`,
    role: '',
    org: '',
    email: '',
    phone: '',
    isPrimary: false,
    ...partial,
  }
}

function activity(partial: Partial<CrmActivity> & { title: string; happenedAt: string }): CrmActivity {
  return {
    id: partial.id || `demo-a-${partial.title.slice(0, 8)}`,
    kind: 'note',
    body: '',
    author: 'Демо',
    createdAt: partial.happenedAt,
    ...partial,
  }
}

function plan(partial: Partial<CrmPlan> & { title: string }): CrmPlan {
  return {
    id: partial.id || `demo-n-${partial.title.slice(0, 8)}`,
    kind: 'other',
    dueAt: '',
    body: '',
    status: 'open',
    createdAt: at(-20),
    ...partial,
  }
}

function deal(partial: Omit<CrmDeal, 'contacts' | 'activities' | 'plans' | 'nextTouchAt' | 'createdAt' | 'updatedAt'> & {
  contacts?: CrmContact[]
  activities?: CrmActivity[]
  plans?: CrmPlan[]
}): CrmDeal {
  const plans = partial.plans || []
  const next = plans
    .filter((item) => item.status === 'open' && item.dueAt)
    .map((item) => item.dueAt as string)
    .sort()[0] || null
  return {
    grantor: '',
    notes: '',
    budget: null,
    industry: '',
    country: 'Россия',
    region: '',
    contacts: [],
    activities: [],
    plans: [],
    createdAt: at(-30),
    updatedAt: at(-1),
    ...partial,
    nextTouchAt: next,
  }
}

export const CRM_DEMO_DEALS: CrmDeal[] = [
  deal({
    id: 'demo-lead-campus',
    name: 'Кампус ДВФУ, вторая очередь',
    stage: 'lead',
    sourceType: 'infovod',
    infovodId: 'demo-hit-1',
    industry: 'Строительство',
    region: 'Приморский край',
    budget: 18_400_000_000,
    grantor: 'Правительство Приморского края',
    owner: 'Соколова Е.',
    contacts: [contact({ name: 'Павел Ким', role: 'Концедент', org: 'Минстрой ПК', email: 'kim@primorye.demo', isPrimary: true })],
    activities: [activity({ kind: 'note', title: 'Карточка из СМИ', body: 'Анонс кампуса, ищут инвестора на общежития и спортядро.', happenedAt: at(-4) })],
    plans: [plan({ kind: 'call', title: 'Созвон с аппаратом губернатора', dueAt: at(3), body: 'Уточнить, открыт ли КС или только подряд.' })],
  }),
  deal({
    id: 'demo-lead-tver',
    name: 'Обход Твери, северный участок',
    stage: 'lead',
    sourceType: 'project',
    projectId: 'demo-p-tver',
    industry: 'Транспорт',
    region: 'Москва',
    budget: 42_000_000_000,
    grantor: 'Росавтодор',
    owner: 'Волков Н.',
    contacts: [contact({ name: 'Ирина Белова', role: 'Заказчик', org: 'Росавтодор', email: 'belova@rosavtodor.demo' })],
    activities: [activity({ kind: 'email', title: 'Запрос ТЭО', body: 'Отправили шаблон NDA и список вопросов финблока.', happenedAt: at(-2) })],
    plans: [plan({ kind: 'email', title: 'Дожать комплект модели', dueAt: at(5) })],
  }),
  deal({
    id: 'demo-lead-samara',
    name: 'Очистные сооружения Самары',
    stage: 'lead',
    sourceType: 'infovod',
    industry: 'Строительство',
    region: 'Свердловская область',
    budget: 9_600_000_000,
    grantor: 'Администрация Самары',
    owner: 'Соколова Е.',
    contacts: [],
    activities: [activity({ kind: 'note', title: 'Сильный сигнал из мониторинга', body: 'Концессия на водоканал обсуждается в заксобрании.', happenedAt: at(-1) })],
    plans: [plan({ kind: 'other', title: 'Проверить долговую нагрузку региона', dueAt: at(2) })],
  }),
  deal({
    id: 'demo-contact-dc',
    name: 'ЦОД на Кольском полуострове',
    stage: 'contact',
    sourceType: 'project',
    industry: 'IT и ЦОД',
    region: 'Мурманская область',
    budget: 7_400_000_000,
    grantor: 'Корпорация развития МО',
    owner: 'Петров А.',
    contacts: [
      contact({ name: 'Андрей Лапин', role: 'Директор по инвестициям', org: 'КР МО', email: 'lapin@murman.demo', phone: '+7 815 000-00-00', isPrimary: true }),
    ],
    activities: [
      activity({ kind: 'call', title: 'Первый звонок', body: 'Готовы обсуждать ГЧП, если есть якорный клиент на мощность.', happenedAt: at(-8) }),
      activity({ kind: 'email', title: 'Паспорт объекта', body: 'Прислали площадку, лимит сети и черновик концессии.', happenedAt: at(-6) }),
    ],
    plans: [plan({ kind: 'meeting', title: 'Вводная с энергетиками', dueAt: at(4), body: 'Тариф на мощность и схема подключения.' })],
  }),
  deal({
    id: 'demo-contact-school',
    name: 'Школьный кампус, Якутск',
    stage: 'contact',
    sourceType: 'infovod',
    industry: 'Строительство',
    region: 'Новосибирская область',
    budget: 4_200_000_000,
    grantor: 'Минобр РС(Я)',
    owner: 'Волков Н.',
    contacts: [contact({ name: 'Мария Федорова', role: 'Замминистра', org: 'Минобр РС(Я)', email: 'fedorova@edu.demo', isPrimary: true })],
    activities: [activity({ kind: 'call', title: 'Контакт установлен', body: 'Просят сравнить КС и бюджетное строительство.', happenedAt: at(-3) })],
    plans: [plan({ kind: 'call', title: 'Повторный звонок после сравнения', dueAt: at(-1), body: 'Срок вчера — не дозвон.' })],
  }),
  deal({
    id: 'demo-meet-bridge',
    name: 'Мостовой переход через Волгу',
    stage: 'meeting',
    sourceType: 'project',
    industry: 'Транспорт',
    region: 'Воронежская область',
    budget: 61_000_000_000,
    grantor: 'Правительство региона',
    owner: 'Петров А.',
    contacts: [
      contact({ name: 'Сергей Орлов', role: 'Вице-губернатор', org: 'Правительство', email: 'orlov@region.demo', isPrimary: true }),
      contact({ name: 'Ольга Шишкина', role: 'Финансовый блок', org: 'Минфин субъекта', email: 'shishkina@minfin.demo' }),
    ],
    activities: [
      activity({ kind: 'meeting', title: 'Очная встреча в доме правительства', body: 'Интерес к концессии высокий, спор по гранту капитальных затрат.', happenedAt: at(-12) }),
      activity({ kind: 'call', title: 'Созвон после встречи', body: 'Просят чувствительность IRR при гранте 20/30/40%.', happenedAt: at(-9) }),
    ],
    plans: [plan({ kind: 'meeting', title: 'Вторая встреча с моделью', dueAt: at(-2), body: 'Просрочено: ждали актуализацию трафика.' })],
  }),
  deal({
    id: 'demo-meet-heat',
    name: 'Модернизация теплосети Новосибирска',
    stage: 'meeting',
    sourceType: 'project',
    industry: 'Энергетика',
    region: 'Новосибирская область',
    budget: 11_200_000_000,
    grantor: 'Мэрия Новосибирска',
    owner: 'Соколова Е.',
    contacts: [contact({ name: 'Дмитрий Савельев', role: 'Директор ДЖКХ', org: 'Мэрия', email: 'savelev@nsk.demo', isPrimary: true })],
    activities: [activity({ kind: 'meeting', title: 'Техсовет', body: 'Готовы к КС на квартальные сети, тариф — узкое место.', happenedAt: at(-5) })],
    plans: [plan({ kind: 'email', title: 'Выслать сравнительную записку по тарифу', dueAt: at(1) })],
  }),
  deal({
    id: 'demo-offer-m12',
    name: 'Платный участок, продолжение М-12',
    stage: 'offer',
    sourceType: 'project',
    industry: 'Транспорт',
    region: 'Москва',
    budget: 28_700_000_000,
    grantor: 'ГК «Автодор»',
    owner: 'Петров А.',
    contacts: [contact({ name: 'Елена Грачева', role: 'Руководитель проекта', org: 'Автодор', email: 'gracheva@avtodor.demo', isPrimary: true })],
    activities: [
      activity({ kind: 'email', title: 'Оферта направлена', body: 'Срок концессии 20 лет, грант 25%, плата за доступность.', happenedAt: at(-7) }),
      activity({ kind: 'call', title: 'Обратная связь по оферте', body: 'Просят укоротить DPP и переложить трафик-риск.', happenedAt: at(-3) }),
    ],
    plans: [plan({ kind: 'meeting', title: 'Защита оферты у инвесткомитета', dueAt: at(6) })],
  }),
  deal({
    id: 'demo-nego-hospital',
    name: 'Онкоцентр, Казань',
    stage: 'negotiation',
    sourceType: 'infovod',
    industry: 'Фармацевтика',
    region: 'Республика Татарстан',
    budget: 14_800_000_000,
    grantor: 'Минздрав РТ',
    owner: 'Волков Н.',
    contacts: [
      contact({ name: 'Альбина Нуриева', role: 'Куратор ГЧП', org: 'Минздрав РТ', email: 'nurieva@minzdrav.demo', isPrimary: true }),
    ],
    activities: [
      activity({ kind: 'meeting', title: 'Переговоры по плате за доступность', body: 'Стороны сошлись по CAPEX, спор по индексированию OPEX.', happenedAt: at(-4) }),
      activity({ kind: 'email', title: 'Протокол разногласий', body: 'Направили красную версию соглашения.', happenedAt: at(-2) }),
    ],
    plans: [plan({ kind: 'meeting', title: 'Раунд с юристом концедента', dueAt: at(2) })],
  }),
  deal({
    id: 'demo-won-tec',
    name: 'ТЭЦ-5, турбинный контур',
    stage: 'won',
    sourceType: 'project',
    industry: 'Энергетика',
    region: 'Новосибирская область',
    budget: 11_200_000_000,
    grantor: 'Региональная энергокомпания',
    owner: 'Петров А.',
    contacts: [contact({ name: 'Игорь Матвеев', role: 'Гендиректор', org: 'Энергосбыт', email: 'matveev@energy.demo', isPrimary: true })],
    activities: [
      activity({ kind: 'meeting', title: 'Подписание', body: 'Концессия 15 лет, объект ушёл в проработку финмодели.', happenedAt: at(-18) }),
      activity({ kind: 'note', title: 'Сделка закрыта в CRM', body: 'Дальше ведём как объект анализа.', happenedAt: at(-18) }),
    ],
    plans: [plan({ kind: 'other', title: 'Передать в аналитику', status: 'done', dueAt: at(-17) })],
  }),
  deal({
    id: 'demo-lost-gok',
    name: 'ГОК, восточный кластер',
    stage: 'lost',
    sourceType: 'project',
    industry: 'Добыча',
    region: 'Кемеровская область',
    budget: 33_000_000_000,
    grantor: 'Администрация Кузбасса',
    owner: 'Соколова Е.',
    contacts: [contact({ name: 'Виктор Громов', role: 'Куратор', org: 'Минпром', email: 'gromov@kuzbass.demo' })],
    activities: [activity({ kind: 'note', title: 'Отказ', body: 'Выбрали бюджетную стройку, концессия не пошла из-за сырьевого риска.', happenedAt: at(-11) })],
    plans: [],
  }),
  deal({
    id: 'demo-hold-pharma',
    name: 'Фармацевтический завод, Казань',
    stage: 'hold',
    sourceType: 'infovod',
    industry: 'Фармацевтика',
    region: 'Республика Татарстан',
    budget: 6_100_000_000,
    grantor: 'ОЭЗ «Иннополис»',
    owner: 'Волков Н.',
    contacts: [contact({ name: 'Ренат Хайруллин', role: 'Управляющая компания ОЭЗ', org: 'Иннополис', email: 'khairullin@sez.demo', isPrimary: true })],
    activities: [activity({ kind: 'call', title: 'Пауза по решению инвестора', body: 'Ждут якорный контракт с госзакупками. Вернуться в квартале.', happenedAt: at(-14) })],
    plans: [plan({ kind: 'call', title: 'Контрольная точка в квартале', dueAt: at(40) })],
  }),
]

export function isCrmDemoId(id?: string) {
  return Boolean(id && id.startsWith('demo-'))
}

export function getCrmDemoDeal(id?: string) {
  if (!id) return null
  return CRM_DEMO_DEALS.find((item) => item.id === id) || null
}

export function readCrmDemo(): boolean {
  try {
    return localStorage.getItem(DEMO_KEY) === '1'
  } catch {
    return false
  }
}

export function writeCrmDemo(on: boolean) {
  try {
    localStorage.setItem(DEMO_KEY, on ? '1' : '0')
  } catch {
    /* ignore */
  }
}

export function stageCounts(deals: CrmDeal[], stages: readonly { id: CrmStage; label: string }[]) {
  const total = deals.length
  return stages.map((stage) => {
    const count = deals.filter((item) => item.stage === stage.id).length
    return {
      ...stage,
      count,
      share: total ? Math.round((count / total) * 100) : 0,
    }
  })
}
