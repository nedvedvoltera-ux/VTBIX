import type { ConcessionFit, CrmStage, InfovodDecision, InfovodNewsStage, MediaFit, ProjectStatus, Recommendation } from '../types'

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

const INFOVOD_DECISION: Record<InfovodDecision, { label: string; className: string }> = {
  new: { label: 'Новый', className: 'badge badge--info' },
  watch: { label: 'На контроле', className: 'badge badge--warn' },
  pursue: { label: 'В работу', className: 'badge badge--ok' },
  project: { label: 'Объект заведён', className: 'badge badge--ok' },
  dismissed: { label: 'Отклонён', className: 'badge badge--danger' },
}

const INFOVOD_FIT: Record<MediaFit, { label: string; className: string }> = {
  high: { label: 'Сильный сигнал', className: 'badge badge--ok' },
  mid: { label: 'Возможен КС', className: 'badge badge--warn' },
  low: { label: 'Слабый сигнал', className: 'badge badge--danger' },
}

const NEWS_STAGE: Record<InfovodNewsStage, string> = {
  announced: 'Анонс',
  design: 'Проектирование',
  tender: 'Конкурс',
  construction: 'Стройка',
  other: 'Прочее',
}

export function InfovodDecisionBadge({ value }: { value?: InfovodDecision }) {
  const item = INFOVOD_DECISION[value || 'new']
  return <span className={item.className}>{item.label}</span>
}

export function InfovodFitBadge({ value }: { value?: MediaFit }) {
  if (!value) return <span className="badge badge--muted">Нет оценки</span>
  const item = INFOVOD_FIT[value]
  return <span className={item.className}>{item.label}</span>
}

export function NewsStageBadge({ value }: { value?: InfovodNewsStage }) {
  if (!value) return null
  return <span className="badge badge--muted">{NEWS_STAGE[value]}</span>
}

const CRM_STAGE: Record<CrmStage, { label: string; className: string }> = {
  lead: { label: 'Новый', className: 'badge badge--info' },
  contact: { label: 'Контакт', className: 'badge badge--warn' },
  meeting: { label: 'Встреча', className: 'badge badge--ok' },
  offer: { label: 'Предложение', className: 'badge badge--ok' },
  negotiation: { label: 'Переговоры', className: 'badge badge--warn' },
  won: { label: 'Сделка', className: 'badge badge--ok' },
  lost: { label: 'Отказ', className: 'badge badge--danger' },
  hold: { label: 'Пауза', className: 'badge badge--muted' },
}

export function CrmStageBadge({ value }: { value?: CrmStage }) {
  const item = CRM_STAGE[value || 'lead']
  return <span className={item.className}>{item.label}</span>
}
