import type { ConcessionFit, MetricWeight, Project, PromptConfig, Recommendation } from '../types'

export const DEFAULT_METRIC_WEIGHT = 10

const DEFAULT_WEIGHT_BY_KEY: Record<string, number> = {
  npv: 25,
  irr: 25,
  dpp: 15,
  wacc: 10,
  ebitdamargin: 15,
  dscr: 10,
}

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

export function normalizeMetrics(raw: unknown): MetricWeight[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const next: MetricWeight[] = []
  for (const item of raw) {
    const name = typeof item === 'string' ? item.trim() : String((item as MetricWeight)?.name ?? '').trim()
    if (!name) continue
    const key = metricKey(name)
    if (seen.has(key)) continue
    seen.add(key)
    const explicit = typeof item === 'object' && item != null && 'weight' in item ? Number((item as MetricWeight).weight) : NaN
    const weight = Number.isFinite(explicit) ? clampScore(explicit) : (DEFAULT_WEIGHT_BY_KEY[key] ?? DEFAULT_METRIC_WEIGHT)
    next.push({ name, weight })
  }
  return next
}

export function hydratePrompt(raw: Partial<PromptConfig> | null | undefined, fallback: PromptConfig): PromptConfig {
  const merged = { ...fallback, ...raw }
  if (raw?.metrics == null) return { ...merged, metrics: fallback.metrics }
  return { ...merged, metrics: normalizeMetrics(raw.metrics) }
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
  const rows = project.note?.financials ?? []
  const parts: RankingPart[] = []
  let weighted = 0
  let weightSum = 0

  for (const metric of metrics) {
    if (metric.weight <= 0) continue
    const row = rows.find((item) => item.score != null && metricsMatch(item.metric, metric.name))
    if (row?.score == null) continue
    const score = clampScore(row.score)
    weighted += score * metric.weight
    weightSum += metric.weight
    parts.push({ name: metric.name, weight: metric.weight, score, contribution: score * metric.weight })
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
