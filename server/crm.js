import {
  deleteCrmDeal,
  getCrmDeal,
  getMediaHit,
  getProject,
  listCrmDeals,
  listProjects,
  listMediaHits,
  nowIso,
  saveCrmDeal,
  uid,
} from './db.js'
import { publicMailSettings, saveMailSettings, sendDealEmail, testMailConnection } from './mail.js'

const STAGES = new Set(['lead', 'contact', 'meeting', 'offer', 'negotiation', 'won', 'lost', 'hold'])
const TOUCH_KINDS = new Set(['meeting', 'call', 'email', 'note', 'other'])
const PLAN_STATUSES = new Set(['open', 'done', 'cancelled'])

function clip(value, max = 240) {
  const text = String(value || '').trim()
  return text ? text.slice(0, max) : ''
}

function fail(status, message, code = 'crm') {
  const error = new Error(message)
  error.status = status
  error.code = code
  return error
}

function normalizeStage(value) {
  return STAGES.has(value) ? value : 'lead'
}

function normalizeKind(value, fallback = 'note') {
  return TOUCH_KINDS.has(value) ? value : fallback
}

function nextTouchAt(plans) {
  const open = (Array.isArray(plans) ? plans : [])
    .filter((item) => item.status === 'open' && item.dueAt)
    .map((item) => item.dueAt)
    .sort()
  return open[0] || null
}

export function hydrateDeal(raw) {
  if (!raw || typeof raw !== 'object') return null
  const contacts = Array.isArray(raw.contacts) ? raw.contacts.map(hydrateContact).filter(Boolean) : []
  const activities = Array.isArray(raw.activities) ? raw.activities.map(hydrateActivity).filter(Boolean) : []
  const plans = Array.isArray(raw.plans) ? raw.plans.map(hydratePlan).filter(Boolean) : []
  return {
    id: raw.id,
    name: clip(raw.name, 180) || 'Без названия',
    stage: normalizeStage(raw.stage),
    sourceType: raw.sourceType === 'infovod' ? 'infovod' : 'project',
    projectId: raw.projectId || null,
    infovodId: raw.infovodId || null,
    industry: clip(raw.industry, 80),
    country: clip(raw.country, 80),
    region: clip(raw.region, 120),
    budget: raw.budget == null || raw.budget === '' ? null : Number(raw.budget) || null,
    grantor: clip(raw.grantor, 160),
    owner: clip(raw.owner, 80) || 'Вы',
    notes: typeof raw.notes === 'string' ? raw.notes.slice(0, 4000) : '',
    contacts,
    activities: [...activities].sort((a, b) => String(b.happenedAt).localeCompare(String(a.happenedAt))),
    plans: [...plans].sort((a, b) => String(a.dueAt || a.createdAt).localeCompare(String(b.dueAt || b.createdAt))),
    nextTouchAt: nextTouchAt(plans),
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  }
}

function hydrateContact(raw) {
  if (!raw || typeof raw !== 'object') return null
  const name = clip(raw.name, 120)
  if (!name) return null
  return {
    id: raw.id || uid('c'),
    name,
    role: clip(raw.role, 80),
    org: clip(raw.org, 120),
    email: clip(raw.email, 160),
    phone: clip(raw.phone, 40),
    isPrimary: Boolean(raw.isPrimary),
  }
}

function hydrateActivity(raw) {
  if (!raw || typeof raw !== 'object') return null
  const body = String(raw.body || '').trim()
  const title = clip(raw.title, 180)
  if (!body && !title) return null
  return {
    id: raw.id || uid('a'),
    kind: normalizeKind(raw.kind, 'note'),
    happenedAt: raw.happenedAt || nowIso(),
    title,
    body: body.slice(0, 4000),
    author: clip(raw.author, 80) || 'Вы',
    createdAt: raw.createdAt || nowIso(),
  }
}

function hydratePlan(raw) {
  if (!raw || typeof raw !== 'object') return null
  const title = clip(raw.title, 180)
  if (!title) return null
  return {
    id: raw.id || uid('n'),
    kind: normalizeKind(raw.kind, 'other'),
    dueAt: raw.dueAt || '',
    title,
    body: String(raw.body || '').trim().slice(0, 2000),
    status: PLAN_STATUSES.has(raw.status) ? raw.status : 'open',
    createdAt: raw.createdAt || nowIso(),
  }
}

async function persist(deal) {
  const hydrated = hydrateDeal({ ...deal, updatedAt: nowIso() })
  return hydrateDeal(await saveCrmDeal(hydrated))
}

export async function listPublicDeals() {
  return (await listCrmDeals()).map(hydrateDeal).filter(Boolean)
}

export async function getPublicDeal(id) {
  const deal = await getCrmDeal(id)
  return deal ? hydrateDeal(deal) : null
}

export async function findDealBySource({ projectId, infovodId } = {}) {
  const deals = await listPublicDeals()
  if (infovodId) {
    const byHit = deals.find((item) => item.infovodId === infovodId)
    if (byHit) return byHit
  }
  if (projectId) {
    const byProject = deals.find((item) => item.projectId === projectId)
    if (byProject) return byProject
  }
  return null
}

export async function lookupDeal(query = {}) {
  const deal = await findDealBySource({
    projectId: query.projectId ? String(query.projectId) : '',
    infovodId: query.infovodId ? String(query.infovodId) : '',
  })
  return { deal }
}

export async function listCrmSources() {
  const deals = await listPublicDeals()
  const usedProjects = new Set(deals.map((item) => item.projectId).filter(Boolean))
  const usedHits = new Set(deals.map((item) => item.infovodId).filter(Boolean))
  const projects = (await listProjects()).map((item) => ({
    id: item.id,
    name: item.name,
    industry: item.industry || '',
    country: item.country || '',
    region: item.region || '',
    dealId: deals.find((deal) => deal.projectId === item.id)?.id || null,
    taken: usedProjects.has(item.id),
  }))
  const infovods = (await listMediaHits()).map((item) => ({
    id: item.id,
    name: item.name || item.projectName || item.title,
    industry: item.industry || '',
    country: item.country || '',
    region: item.region || '',
    dealId: deals.find((deal) => deal.infovodId === item.id)?.id || null,
    taken: usedHits.has(item.id),
  }))
  return { projects, infovods }
}

export async function createDeal(body = {}, actor = 'Вы') {
  const sourceType = body.sourceType === 'infovod' ? 'infovod' : body.sourceType === 'project' ? 'project' : ''
  if (!sourceType) throw fail(400, 'Укажите повод: объект анализа или инфоповод')

  if (sourceType === 'project') {
    const project = await getProject(body.projectId)
    if (!project) throw fail(404, 'Объект анализа не найден')
    const existing = await findDealBySource({ projectId: project.id })
    if (existing) return { deal: existing, existed: true }
    const now = nowIso()
    const deal = await persist({
      id: uid('d'),
      name: clip(body.name, 180) || project.name,
      stage: 'lead',
      sourceType: 'project',
      projectId: project.id,
      infovodId: null,
      industry: project.industry || '',
      country: project.country || '',
      region: project.region || '',
      budget: project.budget ?? null,
      grantor: '',
      owner: clip(body.owner, 80) || actor,
      notes: '',
      contacts: [],
      activities: [
        {
          id: uid('a'),
          kind: 'note',
          happenedAt: now,
          title: 'Карточка заведена',
          body: `Повод: объект анализа «${project.name}».`,
          author: actor,
          createdAt: now,
        },
      ],
      plans: [],
      createdAt: now,
    })
    return { deal, existed: false }
  }

  const hit = await getMediaHit(body.infovodId)
  if (!hit) throw fail(404, 'Инфоповод не найден')
  const existing = await findDealBySource({ infovodId: hit.id, projectId: hit.projectId })
  if (existing) {
    const merged = await persist({
      ...existing,
      infovodId: existing.infovodId || hit.id,
      projectId: existing.projectId || hit.projectId || null,
      grantor: existing.grantor || hit.grantor || '',
    })
    return { deal: merged, existed: true }
  }
  const now = nowIso()
  const name = clip(body.name, 180) || hit.name || hit.projectName || hit.title
  const deal = await persist({
    id: uid('d'),
    name,
    stage: 'lead',
    sourceType: 'infovod',
    projectId: hit.projectId || null,
    infovodId: hit.id,
    industry: hit.industry || '',
    country: hit.country || 'Россия',
    region: hit.region || '',
    budget: hit.budgetEstimate ?? null,
    grantor: hit.grantor || '',
    owner: clip(body.owner, 80) || actor,
    notes: hit.nextStep || '',
    contacts: hit.grantor
      ? [{ id: uid('c'), name: hit.grantor, role: 'Концедент', org: hit.grantor, email: '', phone: '', isPrimary: true }]
      : [],
    activities: [
      {
        id: uid('a'),
        kind: 'note',
        happenedAt: now,
        title: 'Карточка заведена',
        body: `Повод: инфоповод «${name}».${hit.concessionAngle ? ` ${hit.concessionAngle}` : ''}`,
        author: actor,
        createdAt: now,
      },
    ],
    plans: hit.nextStep
      ? [
          {
            id: uid('n'),
            kind: 'other',
            dueAt: '',
            title: 'Следующий шаг из инфоповода',
            body: hit.nextStep,
            status: 'open',
            createdAt: now,
          },
        ]
      : [],
    createdAt: now,
  })
  return { deal, existed: false }
}

export async function updateDeal(id, patch = {}) {
  const current = await getPublicDeal(id)
  if (!current) return null
  const next = { ...current }
  if (patch.name !== undefined) next.name = clip(patch.name, 180) || current.name
  if (patch.stage !== undefined) next.stage = normalizeStage(patch.stage)
  if (patch.owner !== undefined) next.owner = clip(patch.owner, 80) || current.owner
  if (patch.notes !== undefined) next.notes = String(patch.notes || '').slice(0, 4000)
  if (patch.grantor !== undefined) next.grantor = clip(patch.grantor, 160)
  if (patch.industry !== undefined) next.industry = clip(patch.industry, 80)
  if (patch.country !== undefined) next.country = clip(patch.country, 80)
  if (patch.region !== undefined) next.region = clip(patch.region, 120)
  return persist(next)
}

export async function removeDeal(id) {
  return deleteCrmDeal(id)
}

export async function addContact(id, body = {}) {
  const deal = await getPublicDeal(id)
  if (!deal) return null
  const contact = hydrateContact({ ...body, id: uid('c') })
  if (!contact) throw fail(400, 'Укажите имя контакта')
  const contacts = contact.isPrimary ? deal.contacts.map((item) => ({ ...item, isPrimary: false })) : deal.contacts
  return persist({ ...deal, contacts: [...contacts, contact] })
}

export async function updateContact(id, contactId, body = {}) {
  const deal = await getPublicDeal(id)
  if (!deal) return null
  const current = deal.contacts.find((item) => item.id === contactId)
  if (!current) throw fail(404, 'Контакт не найден')
  const contact = hydrateContact({ ...current, ...body, id: contactId })
  if (!contact) throw fail(400, 'Укажите имя контакта')
  const contacts = deal.contacts.map((item) => {
    if (item.id === contactId) return contact
    return contact.isPrimary ? { ...item, isPrimary: false } : item
  })
  return persist({ ...deal, contacts })
}

export async function removeContact(id, contactId) {
  const deal = await getPublicDeal(id)
  if (!deal) return null
  return persist({ ...deal, contacts: deal.contacts.filter((item) => item.id !== contactId) })
}

export async function addActivity(id, body = {}, actor = 'Вы') {
  const deal = await getPublicDeal(id)
  if (!deal) return null
  const activity = hydrateActivity({
    ...body,
    id: uid('a'),
    author: actor,
    happenedAt: body.happenedAt || nowIso(),
    createdAt: nowIso(),
  })
  if (!activity) throw fail(400, 'Опишите встречу, звонок или письмо')
  return persist({ ...deal, activities: [activity, ...deal.activities] })
}

export async function removeActivity(id, activityId) {
  const deal = await getPublicDeal(id)
  if (!deal) return null
  return persist({ ...deal, activities: deal.activities.filter((item) => item.id !== activityId) })
}

export async function addPlan(id, body = {}) {
  const deal = await getPublicDeal(id)
  if (!deal) return null
  const plan = hydratePlan({ ...body, id: uid('n'), status: 'open', createdAt: nowIso() })
  if (!plan) throw fail(400, 'Укажите, что запланировать на следующее касание')
  return persist({ ...deal, plans: [...deal.plans, plan] })
}

export async function updatePlan(id, planId, body = {}, actor = 'Вы') {
  const deal = await getPublicDeal(id)
  if (!deal) return null
  const current = deal.plans.find((item) => item.id === planId)
  if (!current) throw fail(404, 'План касания не найден')
  const plan = hydratePlan({ ...current, ...body, id: planId })
  let activities = deal.activities
  if (current.status !== 'done' && plan.status === 'done') {
    const activity = hydrateActivity({
      id: uid('a'),
      kind: plan.kind === 'other' ? 'note' : plan.kind,
      happenedAt: nowIso(),
      title: plan.title,
      body: clip(body.result, 2000) || plan.body || 'Касание выполнено',
      author: actor,
      createdAt: nowIso(),
    })
    if (activity) activities = [activity, ...activities]
  }
  return persist({
    ...deal,
    plans: deal.plans.map((item) => (item.id === planId ? plan : item)),
    activities,
  })
}

export async function removePlan(id, planId) {
  const deal = await getPublicDeal(id)
  if (!deal) return null
  return persist({ ...deal, plans: deal.plans.filter((item) => item.id !== planId) })
}

export async function sendFromDeal(id, body = {}, actor = 'Вы') {
  const deal = await getPublicDeal(id)
  if (!deal) return null
  const sent = await sendDealEmail({
    to: body.to,
    cc: body.cc,
    subject: body.subject || deal.name,
    body: body.body,
  })
  const activity = hydrateActivity({
    id: uid('a'),
    kind: 'email',
    happenedAt: nowIso(),
    title: sent.subject,
    body: `Кому: ${sent.to.join(', ')}\n${body.body}`,
    author: actor,
    createdAt: nowIso(),
  })
  const next = await persist({ ...deal, activities: [activity, ...deal.activities] })
  return { deal: next, sent }
}

export async function attachProjectToInfovodDeal(infovodId, projectId) {
  const deal = await findDealBySource({ infovodId, projectId })
  if (!deal) return null
  if (deal.projectId === projectId && deal.infovodId === infovodId) return deal
  return persist({
    ...deal,
    projectId: deal.projectId || projectId,
    infovodId: deal.infovodId || infovodId,
  })
}

export { publicMailSettings, saveMailSettings, testMailConnection }
