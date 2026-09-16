import {
  clearMediaHits,
  deleteMediaHit,
  getMediaConfig,
  getMediaHit,
  getMediaJob,
  getProject,
  insertMediaJob,
  latestMediaJob,
  listMediaHits,
  nowIso,
  patchMediaHit,
  saveMediaConfig,
  saveProject,
  uid,
  updateMediaJob,
  upsertMediaHit,
} from './db.js'
import { config } from './config.js'
import { buildMediaInstructions, hydrateMediaPrompt, MEDIA_JSON_SCHEMA } from './mediaPrompt.js'
import { completeJsonWithLlm } from './qwen.js'
import { collectSearchResults, hydratePages } from './webSearch.js'

let running = null
let abortCtrl = null

export function mediaStatus() {
  return {
    running: Boolean(running),
    jobId: running,
  }
}

function clip(value, max = 400) {
  const text = String(value || '').trim()
  if (!text) return ''
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function normalizeFit(value) {
  const raw = String(value || '').toLowerCase()
  if (raw === 'high' || raw === 'mid' || raw === 'low') return raw
  return 'mid'
}

function normalizeDecision(value) {
  const raw = String(value || '').toLowerCase()
  if (raw === 'watch' || raw === 'pursue' || raw === 'project' || raw === 'dismissed' || raw === 'new') return raw
  return 'new'
}

function normalizeStage(value) {
  const raw = String(value || '').toLowerCase()
  if (raw === 'announced' || raw === 'design' || raw === 'tender' || raw === 'construction' || raw === 'other') return raw
  return 'other'
}

function parseBudget(hint) {
  const text = String(hint || '')
  const match = text.match(/(\d+[.,]?\d*)\s*(млрд|млн)/i)
  if (!match) return null
  const raw = Number(match[1].replace(',', '.'))
  if (!Number.isFinite(raw)) return null
  return match[2].toLowerCase() === 'млрд' ? raw * 1_000_000_000 : raw * 1_000_000
}

export function hydrateInfovod(raw) {
  if (!raw || typeof raw !== 'object') return null
  const title = clip(raw.title, 220)
  const url = String(raw.url || '').trim()
  if (!title || !url) return null
  const name = clip(raw.name || raw.projectName || title, 160)
  const budgetHint = clip(raw.budgetHint, 120)
  return {
    ...raw,
    name,
    title,
    url,
    source: String(raw.source || ''),
    publishedAt: raw.publishedAt || undefined,
    projectName: clip(raw.projectName || name, 160),
    country: clip(raw.country || 'Россия', 80) || 'Россия',
    region: clip(raw.region, 120),
    industry: clip(raw.industry, 80),
    grantor: clip(raw.grantor, 160),
    objectType: clip(raw.objectType, 80),
    newsStage: normalizeStage(raw.newsStage),
    budgetHint,
    budgetEstimate: raw.budgetEstimate == null ? parseBudget(budgetHint) : Number(raw.budgetEstimate) || null,
    snippet: clip(raw.snippet, 360),
    summary: clip(raw.summary, 500),
    concessionAngle: clip(raw.concessionAngle, 420),
    nextStep: clip(raw.nextStep, 240),
    fit: normalizeFit(raw.fit),
    score: Number.isFinite(Number(raw.score)) ? Math.max(0, Math.min(100, Math.round(Number(raw.score)))) : undefined,
    decision: normalizeDecision(raw.decision),
    notes: typeof raw.notes === 'string' ? raw.notes : '',
    projectId: raw.projectId || null,
  }
}

function normalizeHit(raw, fallback) {
  return hydrateInfovod({
    ...fallback,
    ...raw,
    url: raw?.url || fallback?.url,
    title: raw?.title || fallback?.title,
    source: raw?.source || fallback?.source,
    publishedAt: raw?.publishedAt || fallback?.publishedAt,
    snippet: raw?.snippet || fallback?.snippet,
    decision: 'new',
  })
}

function pagesToPrompt(pages) {
  return pages
    .map((item, index) => {
      const body = clip(item.text || item.snippet, 2800)
      return [
        `### ${index + 1}. ${item.title}`,
        `URL: ${item.url}`,
        `Источник: ${item.source || ''}`,
        item.publishedAt ? `Дата: ${item.publishedAt}` : '',
        body,
      ]
        .filter(Boolean)
        .join('\n')
    })
    .join('\n\n')
}

export async function getPublicMediaConfig() {
  return hydrateMediaPrompt(await getMediaConfig())
}

export async function putPublicMediaConfig(body) {
  const next = hydrateMediaPrompt(body)
  await saveMediaConfig(next)
  return next
}

export async function listPublicMediaHits() {
  return (await listMediaHits()).map((item) => hydrateInfovod(item)).filter(Boolean)
}

export async function getPublicMediaHit(id) {
  const hit = await getMediaHit(id)
  return hit ? hydrateInfovod(hit) : null
}

export async function updatePublicMediaHit(id, patch) {
  const allowed = {}
  if (patch?.decision) allowed.decision = normalizeDecision(patch.decision)
  if (typeof patch?.notes === 'string') allowed.notes = patch.notes
  if (typeof patch?.name === 'string' && patch.name.trim()) allowed.name = clip(patch.name, 160)
  const next = await patchMediaHit(id, allowed)
  return next ? hydrateInfovod(next) : null
}

export async function convertHitToProject(id) {
  const hit = hydrateInfovod(await getMediaHit(id))
  if (!hit) return null
  if (hit.projectId) {
    const project = await getProject(hit.projectId)
    try {
      const { attachProjectToInfovodDeal } = await import('./crm.js')
      await attachProjectToInfovodDeal(id, hit.projectId)
    } catch {
      /* CRM optional */
    }
    return { hit, project, projectId: hit.projectId, existed: true }
  }
  const now = nowIso()
  const notes = [
    `Инфоповод из СМИ: ${hit.title}`,
    hit.url ? `Источник: ${hit.url}` : '',
    hit.grantor ? `Публичный партнёр: ${hit.grantor}` : '',
    hit.objectType ? `Объект: ${hit.objectType}` : '',
    hit.summary || '',
    hit.concessionAngle ? `Концессионный угол: ${hit.concessionAngle}` : '',
    hit.nextStep ? `Следующий шаг: ${hit.nextStep}` : '',
  ]
    .filter(Boolean)
    .join('\n')
  const project = {
    id: uid('p'),
    name: hit.name || hit.projectName || hit.title,
    fileName: null,
    fileSize: null,
    notes,
    industry: hit.industry || '',
    country: hit.country || 'Россия',
    region: hit.region || '',
    budget: hit.budgetEstimate ?? null,
    status: 'draft',
    progress: 0,
    createdAt: now,
    updatedAt: now,
    extractedByLlm: false,
    owner: 'Вы',
    documents: [],
  }
  await saveProject(project)
  const saved = await patchMediaHit(id, { decision: 'project', projectId: project.id })
  try {
    const { attachProjectToInfovodDeal } = await import('./crm.js')
    await attachProjectToInfovodDeal(id, project.id)
  } catch {
    /* CRM optional */
  }
  return { hit: hydrateInfovod(saved), project, projectId: project.id, existed: false }
}

export async function removeMediaHit(id) {
  return deleteMediaHit(id)
}

export async function resetMediaHits() {
  await clearMediaHits()
}

export async function getPublicMediaStatus() {
  const job = await latestMediaJob()
  return {
    running: Boolean(running),
    job,
  }
}

export async function startMediaRun() {
  if (running) {
    const error = new Error('Мониторинг уже идёт')
    error.status = 409
    error.code = 'busy'
    throw error
  }
  const prompt = hydrateMediaPrompt(await getMediaConfig())
  if (!prompt.keywords.length) {
    const error = new Error('Добавьте хотя бы одно ключевое слово')
    error.status = 400
    error.code = 'invalid'
    throw error
  }
  if (prompt.searchMode === 'sites' && !prompt.sites.length) {
    const error = new Error('Укажите сайты или включите свободный веб-поиск')
    error.status = 400
    error.code = 'invalid'
    throw error
  }

  const id = uid('mj')
  const createdAt = nowIso()
  await insertMediaJob({
    id,
    status: 'processing',
    stage: 'searching',
    created_at: createdAt,
  })
  abortCtrl = new AbortController()
  running = id
  const timeout = setTimeout(() => abortCtrl.abort(), config.llmTimeoutMs + 90_000)

  void (async () => {
    try {
      await updateMediaJob(id, { stage: 'searching' })
      const found = await collectSearchResults({
        keywords: prompt.keywords,
        sites: prompt.sites,
        searchMode: prompt.searchMode,
        lookbackDays: prompt.lookbackDays,
        maxResults: prompt.maxResults,
      })
      if (abortCtrl.signal.aborted) throw new Error('Остановлено')
      if (!found.results.length) {
        throw new Error(
          `Веб-поиск ничего не нашёл. ${found.errors.slice(0, 2).join('; ') || 'Проверьте сеть или список сайтов.'}`,
        )
      }

      await updateMediaJob(id, {
        stage: 'fetching',
        stats: { found: found.results.length, query: found.query, provider: found.provider },
      })
      const pages = await hydratePages(found.results, prompt.maxResults)
      if (!pages.length) throw new Error('Не удалось прочитать найденные страницы')

      await updateMediaJob(id, {
        stage: 'analyzing',
        stats: {
          found: found.results.length,
          pages: pages.length,
          query: found.query,
          provider: found.provider,
        },
      })

      const { extracted } = await completeJsonWithLlm({
        systemPrompt: buildMediaInstructions(prompt),
        userPrompt: [
          'Ниже сниппеты публикаций после веб-поиска. Отбери крупные стройки/инфраструктуру с потенциалом концессии.',
          `Схема: ${JSON.stringify(MEDIA_JSON_SCHEMA)}`,
          pagesToPrompt(pages),
        ].join('\n\n'),
        signal: abortCtrl.signal,
        emptyError: 'Модель не вернула JSON по публикациям СМИ',
      })

      const byUrl = new Map(pages.map((item) => [item.url, item]))
      const list = Array.isArray(extracted?.publications) ? extracted.publications : []
      const saved = []
      for (const item of list) {
        const hit = normalizeHit(item, byUrl.get(String(item?.url || '')))
        if (!hit) continue
        saved.push(await upsertMediaHit({ ...hit, foundAt: nowIso() }))
      }

      await updateMediaJob(id, {
        status: 'done',
        stage: 'done',
        finished_at: nowIso(),
        stats: {
          found: found.results.length,
          pages: pages.length,
          kept: saved.length,
          query: found.query,
          provider: found.provider,
          searchErrors: found.errors.slice(0, 6),
        },
      })
    } catch (error) {
      await updateMediaJob(id, {
        status: 'error',
        stage: 'error',
        error: error instanceof Error ? error.message : String(error),
        finished_at: nowIso(),
      })
    } finally {
      clearTimeout(timeout)
      if (running === id) running = null
      abortCtrl = null
    }
  })()

  return getMediaJob(id)
}
