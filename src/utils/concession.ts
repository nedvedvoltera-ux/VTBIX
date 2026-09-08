import type { ConcessionFit, Recommendation } from '../types'

export function deriveConcession(
  score?: number,
  recommendation?: Recommendation,
): { concessionFit?: ConcessionFit; concessionScore?: number } {
  if (score == null && !recommendation) return {}
  const concessionScore = score ?? (recommendation === 'invest' ? 82 : recommendation === 'revise' ? 64 : 42)
  const concessionFit: ConcessionFit =
    concessionScore >= 78 ? 'advantageous' : concessionScore >= 58 ? 'average' : 'unfavorable'
  return { concessionScore, concessionFit }
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
