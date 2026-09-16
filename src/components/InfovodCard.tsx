import { Link } from 'react-router-dom'
import type { MouseEvent } from 'react'
import type { InfovodDecision, MediaPublication } from '../types'
import { formatBudget, formatDate } from '../utils/format'
import { InfovodDecisionBadge, InfovodFitBadge, NewsStageBadge } from './StatusBadge'
import { IconPin, IconWallet } from './Icons'

const FIT_TONE: Record<string, string> = {
  high: 'advantageous',
  mid: 'average',
  low: 'unfavorable',
}

export function InfovodCard({
  item,
  onDecision,
}: {
  item: MediaPublication
  onDecision?: (id: string, decision: InfovodDecision) => void
}) {
  const tone = FIT_TONE[item.fit || 'mid'] || 'none'

  function act(event: MouseEvent, decision: InfovodDecision) {
    event.preventDefault()
    event.stopPropagation()
    onDecision?.(item.id, decision)
  }

  return (
    <div className="project-card-wrap">
      <Link to={`/media/${item.id}`} className={`card project-card project-card--${tone}`}>
        <div className="project-card__head">
          <InfovodDecisionBadge value={item.decision} />
          <InfovodFitBadge value={item.fit} />
          <NewsStageBadge value={item.newsStage} />
          {item.score != null && <span className="score">{item.score} б.</span>}
        </div>
        <p className="eyebrow">Инфоповод</p>
        <h3>{item.name || item.projectName || item.title}</h3>
        <p className="project-card__meta">
          {item.industry || 'Отрасль не извлечена'}
          <span aria-hidden="true"> · </span>
          <IconPin className="inline-icon" />
          {[item.country, item.region].filter(Boolean).join(', ') || 'локация не извлечена'}
        </p>
        {item.grantor && <p className="hint">Концедент: {item.grantor}</p>}
        {item.objectType && <p className="hint">Объект: {item.objectType}</p>}
        <div className="project-card__budget">
          <IconWallet className="inline-icon" />
          {item.budgetEstimate != null ? formatBudget(item.budgetEstimate) : item.budgetHint || 'бюджет не указан'}
        </div>
        {item.nextStep && <p className="hint">{item.nextStep}</p>}
        <div className="project-card__foot">
          <span>{item.source || 'СМИ'}</span>
          <span>{formatDate(item.publishedAt || item.foundAt || '')}</span>
        </div>
      </Link>
      {onDecision && item.decision !== 'project' && item.decision !== 'dismissed' && (
        <div className="infovod-card__acts">
          {item.decision !== 'watch' && (
            <button type="button" className="btn btn--ghost" onClick={(event) => act(event, 'watch')}>
              На контроль
            </button>
          )}
          {item.decision !== 'pursue' && (
            <button type="button" className="btn btn--ghost" onClick={(event) => act(event, 'pursue')}>
              В работу
            </button>
          )}
          <button type="button" className="btn btn--ghost" onClick={(event) => act(event, 'dismissed')}>
            Отклонить
          </button>
        </div>
      )}
    </div>
  )
}
