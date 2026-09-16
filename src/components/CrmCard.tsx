import { Link } from 'react-router-dom'
import type { CrmDeal } from '../types'
import { isCrmDemoId } from '../data/crmDemo'
import { CRM_SOURCE_FILTERS, CRM_TOUCH_KINDS } from '../data/mock'
import { formatBudget, formatDate } from '../utils/format'
import { CrmStageBadge } from './StatusBadge'
import { IconPin, IconWallet } from './Icons'

export type CrmView = 'board' | 'tile' | 'row'

function sourceLabel(deal: CrmDeal) {
  return CRM_SOURCE_FILTERS.find((item) => item.id === deal.sourceType)?.label || 'Повод'
}

function nextPlan(deal: CrmDeal) {
  return deal.plans.find((item) => item.status === 'open')
}

function tone(deal: CrmDeal) {
  if (deal.stage === 'won') return 'advantageous'
  if (deal.stage === 'lost') return 'unfavorable'
  if (deal.nextTouchAt && Date.parse(deal.nextTouchAt) < Date.now()) return 'unfavorable'
  return 'average'
}

export function CrmCard({ item, variant = 'tile' }: { item: CrmDeal; variant?: Exclude<CrmView, 'board'> }) {
  const plan = nextPlan(item)
  const overdue = Boolean(item.nextTouchAt && Date.parse(item.nextTouchAt) < Date.now())
  const kind = CRM_TOUCH_KINDS.find((entry) => entry.id === plan?.kind)?.label
  const demo = isCrmDemoId(item.id)
  const href = `/crm/${item.id}`

  if (variant === 'row') {
    return (
      <Link to={href} className={`crm-grid__row project-row project-row--${tone(item)}`}>
        <span className="project-row__fit" data-label="Стадия">
          <CrmStageBadge value={item.stage} />
          {demo && <em>демо</em>}
        </span>
        <span className="project-row__name">
          <strong>{item.name}</strong>
          <em>{item.grantor || sourceLabel(item)}</em>
        </span>
        <span className="project-row__cell" data-label="Повод">
          {sourceLabel(item)}
        </span>
        <span className="project-row__cell" data-label="Отрасль">
          {item.industry || '—'}
        </span>
        <span className="project-row__cell" data-label="Локация">
          <IconPin className="inline-icon" />
          {[item.country, item.region].filter(Boolean).join(', ') || '—'}
        </span>
        <span className="project-row__cell project-row__budget" data-label="Бюджет">
          {item.budget != null ? formatBudget(item.budget) : '—'}
        </span>
        <span className="project-row__cell" data-label="Касание">
          {plan ? (
            <span className={overdue ? 'hint hint--danger' : undefined}>
              {overdue ? 'Просрочено' : kind} · {item.nextTouchAt ? formatDate(item.nextTouchAt) : plan.title}
            </span>
          ) : (
            'нет плана'
          )}
        </span>
        <span className="project-row__cell" data-label="Ответственный">
          {item.owner}
        </span>
      </Link>
    )
  }

  return (
    <Link to={href} className={`card project-card project-card--${tone(item)}`}>
      <div className="project-card__head">
        <CrmStageBadge value={item.stage} />
        <span className="badge badge--muted">{sourceLabel(item)}</span>
        {demo && <span className="badge badge--info">Демо</span>}
      </div>
      <p className="eyebrow">CRM</p>
      <h3>{item.name}</h3>
      <p className="project-card__meta">
        {item.industry || 'Отрасль не указана'}
        <span aria-hidden="true"> · </span>
        <IconPin className="inline-icon" />
        {[item.country, item.region].filter(Boolean).join(', ') || 'локация не указана'}
      </p>
      {item.grantor && <p className="hint">Контрагент: {item.grantor}</p>}
      <div className="project-card__budget">
        <IconWallet className="inline-icon" />
        {item.budget != null ? formatBudget(item.budget) : 'бюджет не указан'}
      </div>
      <p className={overdue ? 'hint hint--danger' : 'hint'}>
        {plan
          ? `${overdue ? 'Просрочено' : 'Следующее касание'}: ${kind || ''} · ${plan.title}${item.nextTouchAt ? ` · ${formatDate(item.nextTouchAt)}` : ''}`
          : 'Нет плана следующего касания'}
      </p>
      <div className="project-card__foot">
        <span>{item.owner}</span>
        <span>{item.contacts.length ? `${item.contacts.length} контакт.` : 'без контактов'}</span>
      </div>
    </Link>
  )
}
