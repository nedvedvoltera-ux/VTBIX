import { PROMPT_SECTIONS } from '../data/promptSections'
import type { ConcessionFit, MetricWeight, Project, PromptConfig, PromptSectionId, Recommendation } from '../types'

export const DEFAULT_METRIC_WEIGHT = 10

const LEGACY_KPI = new Set(['npv', 'irr', 'dpp', 'wacc', 'ebitda', 'ebitdamargin', 'dscr'])

export function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(100, Math.max(0, Math.round(value)))
}

export function metricKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9]+/gi, '')
}

export function metricsMatch(a: string, b: string): boolean {
  const left = metricKey(a)
  const right = metricKey(b)
  if (!left || !right) return false
  return left === right || left.includes(right) || right.includes(left)
}

export function fitFromScore(score: number): ConcessionFit {
  return score >= 78 ? 'advantageous' : score >= 58 ? 'average' : 'unfavorable'
}

export function deriveConcession(
  score?: number,
  recommendation?: Recommendation,
): { concessionFit?: ConcessionFit; concessionScore?: number } {
  if (score == null && !recommendation) return {}
  const concessionScore = score ?? (recommendation === 'invest' ? 82 : recommendation === 'revise' ? 64 : 42)
  return { concessionScore, concessionFit: fitFromScore(concessionScore) }
}

export function sectionByMetric(item: { id?: string; name?: string } | null | undefined) {
  const id = String(item?.id || '').trim()
  if (id) {
    const hit = PROMPT_SECTIONS.find((section) => section.id === id)
    if (hit) return hit
  }
  const key = metricKey(item?.name || '')
  if (!key) return undefined
  return PROMPT_SECTIONS.find((section) => section.id === key || metricKey(section.title) === key)
}

export function isLegacyKpiName(name: string) {
  return LEGACY_KPI.has(metricKey(name))
}

export function metricsFromSections(
  sections: PromptConfig['sections'] | undefined,
  existing: MetricWeight[] = [],
): MetricWeight[] {
  const weights = new Map<PromptSectionId, number>()
  for (const item of existing) {
    const section = sectionByMetric(item)
    if (!section) continue
    weights.set(section.id, item.weight)
  }
  return PROMPT_SECTIONS.filter((section) => sections?.[section.id] !== false).map((section) => ({
    id: section.id,
    name: section.title,
    weight: weights.get(section.id) ?? DEFAULT_METRIC_WEIGHT,
  }))
}

export function normalizeMetrics(raw: unknown): MetricWeight[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const next: MetricWeight[] = []
  for (const item of raw) {
    const rawId = typeof item === 'object' && item != null ? String((item as MetricWeight).id || '').trim() : ''
    const name = typeof item === 'string' ? item.trim() : String((item as MetricWeight)?.name ?? '').trim()
    const section = sectionByMetric({ id: rawId, name })
    const label = section?.title || name
    if (!label) continue
    const key = section?.id || metricKey(label)
    if (seen.has(key)) continue
    seen.add(key)
    const explicit = typeof item === 'object' && item != null && 'weight' in item ? Number((item as MetricWeight).weight) : NaN
    const weight = Number.isFinite(explicit) ? clampScore(explicit) : DEFAULT_METRIC_WEIGHT
    next.push({ id: section?.id, name: label, weight })
  }
  return next
}

export function hydratePrompt(raw: Partial<PromptConfig> | null | undefined, fallback: PromptConfig): PromptConfig {
  const merged = { ...fallback, ...raw }
  const incoming = raw?.metrics
  const normalized = incoming == null ? fallback.metrics : normalizeMetrics(incoming)
  const sectionish = normalized.filter((item) => sectionByMetric(item) && !isLegacyKpiName(item.name))
  return { ...merged, metrics: metricsFromSections(merged.sections, sectionish.length ? sectionish : fallback.metrics) }
}

export function parseSectionScores(raw: unknown): Partial<Record<PromptSectionId, number>> {
  const out: Partial<Record<PromptSectionId, number>> = {}
  const put = (hint: string, score: unknown) => {
    const section = sectionByMetric({ id: hint, name: hint })
    const num = Number(score)
    if (!section || !Number.isFinite(num)) return
    out[section.id] = clampScore(num)
  }
  if (Array.isArray(raw)) {
    for (const row of raw) {
      if (!row || typeof row !== 'object') continue
      const rec = row as { id?: string; name?: string; metric?: string; score?: unknown }
      const section = sectionByMetric({ id: rec.id, name: rec.name || rec.metric })
      if (section) put(section.id, rec.score)
    }
    return out
  }
  if (raw && typeof raw === 'object') {
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (value && typeof value === 'object' && 'score' in (value as object)) {
        put(key, (value as { score: unknown }).score)
      } else {
        put(key, value)
      }
    }
  }
  return out
}

export function lookupSectionScore(project: Project, metric: MetricWeight): number | undefined {
  const section = sectionByMetric(metric)
  const stored = project.note?.sectionScores
  if (section && stored && stored[section.id] != null) return clampScore(stored[section.id] as number)
  const rows = project.note?.financials ?? []
  const names = [metric.name, section?.title, section?.id].filter(Boolean) as string[]
  const row = rows.find((item) => item.score != null && names.some((name) => metricsMatch(item.metric, name)))
  return row?.score == null ? undefined : clampScore(row.score)
}

export type RankingPart = {
  name: string
  weight: number
  score: number
  contribution: number
}

export type RankingResult = {
  score?: number
  fit?: ConcessionFit
  byMetrics: boolean
  parts: RankingPart[]
  weightSum: number
}

export function computeRanking(project: Project, metrics: MetricWeight[] = []): RankingResult {
  if (!project.extractedByLlm || project.status !== 'ready') {
    return { byMetrics: false, parts: [], weightSum: 0 }
  }
  const parts: RankingPart[] = []
  let weighted = 0
  let weightSum = 0

  for (const metric of metrics) {
    if (metric.weight <= 0) continue
    const score = lookupSectionScore(project, metric)
    if (score == null) continue
    weighted += score * metric.weight
    weightSum += metric.weight
    parts.push({
      name: sectionByMetric(metric)?.title || metric.name,
      weight: metric.weight,
      score,
      contribution: score * metric.weight,
    })
  }

  if (weightSum > 0) {
    const score = clampScore(weighted / weightSum)
    return { score, fit: fitFromScore(score), byMetrics: true, parts, weightSum }
  }

  const fallback = project.concessionScore ?? project.score
  if (fallback == null) return { byMetrics: false, parts, weightSum: 0 }
  return { score: clampScore(fallback), fit: project.concessionFit ?? fitFromScore(fallback), byMetrics: false, parts, weightSum: 0 }
}

export function applyRanking(project: Project, metrics: MetricWeight[] = []): Project {
  const ranking = computeRanking(project, metrics)
  if (ranking.score == null) return project
  return { ...project, concessionScore: ranking.score, concessionFit: ranking.fit }
}

export function formatPct(value: number, digits = 1): string {
  return `${value.toLocaleString('ru-RU', { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`
}

export function formatBln(value: number): string {
  return `${value.toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} млрд ₽`
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
}
