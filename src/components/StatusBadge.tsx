import type { ConcessionFit, ProjectStatus, Recommendation } from '../types'

const STATUS: Record<ProjectStatus, { label: string; className: string }> = {
  draft: { label: 'Черновик', className: 'badge badge--muted' },
  queued: { label: 'В очереди', className: 'badge badge--info' },
  processing: { label: 'Расчёт', className: 'badge badge--warn' },
  ready: { label: 'Готово', className: 'badge badge--ok' },
  error: { label: 'Ошибка', className: 'badge badge--danger' },
}

const REC: Record<Recommendation, { label: string; className: string }> = {
  invest: { label: 'Инвестировать', className: 'badge badge--ok' },
  revise: { label: 'Доработать', className: 'badge badge--warn' },
  reject: { label: 'Отклонить', className: 'badge badge--danger' },
}

export const FIT: Record<ConcessionFit, { label: string; className: string }> = {
  advantageous: { label: 'Выгодно', className: 'badge badge--ok' },
  average: { label: 'Средне', className: 'badge badge--warn' },
  unfavorable: { label: 'Невыгодно', className: 'badge badge--danger' },
}

export function StatusBadge({ status }: { status: ProjectStatus }) {
  const item = STATUS[status]
  return <span className={item.className}>{item.label}</span>
}

export function RecommendationBadge({ value }: { value?: Recommendation }) {
  if (!value) return null
  const item = REC[value]
  return <span className={item.className}>{item.label}</span>
}

export function FitBadge({ value }: { value?: ConcessionFit }) {
  if (!value) return <span className="badge badge--muted">Нет оценки</span>
  const item = FIT[value]
  return <span className={item.className}>{item.label}</span>
}
