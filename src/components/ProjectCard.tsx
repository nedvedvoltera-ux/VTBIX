import { Link } from 'react-router-dom'
import type { MouseEvent } from 'react'
import type { Project } from '../types'
import { formatBudget, formatDate } from '../utils/format'
import { FitBadge, RecommendationBadge, StatusBadge } from './StatusBadge'
import { IconPin, IconWallet } from './Icons'

export type ProjectView = 'tile' | 'row'

export function ProjectCard({
  project,
  variant = 'tile',
  rank,
  onDelete,
}: {
  project: Project
  variant?: ProjectView
  rank?: number
  onDelete?: (id: string) => void
}) {
  function handleDelete(event: MouseEvent) {
    event.preventDefault()
    event.stopPropagation()
    onDelete?.(project.id)
  }

  if (variant === 'row') {
    return (
      <div className="project-row-wrap">
        <Link to={`/projects/${project.id}`} className={`project-row project-row--${project.concessionFit ?? 'none'}`}>
        <span className="project-row__fit">
          {rank != null && <span className="rank">#{rank}</span>}
          <FitBadge value={project.concessionFit} />
          {project.concessionScore != null && <em>балл {project.concessionScore}</em>}
        </span>
        <span className="project-row__name">
          <strong>{project.name || 'Без названия'}</strong>
          <em>{project.fileName ?? 'файл не загружен'}</em>
          {project.status === 'processing' && (
            <span className="progress" aria-label={`Прогресс ${project.progress}%`}>
              <span style={{ width: `${project.progress}%` }} />
            </span>
          )}
        </span>
        <span className="project-row__cell" data-label="Расчёт">
          <StatusBadge status={project.status} />
        </span>
        <span className="project-row__cell" data-label="Отрасль">
          {project.industry || '—'}
        </span>
        <span className="project-row__cell" data-label="Локация">
          <IconPin className="inline-icon" />
          {[project.country, project.region].filter(Boolean).join(', ') || '—'}
        </span>
        <span className="project-row__cell project-row__budget" data-label="Бюджет">
          {formatBudget(project.budget)}
        </span>
        <span className="project-row__cell project-row__date" data-label="Обновлён">
          {formatDate(project.updatedAt)}
        </span>
        <span className="project-row__cell project-row__rec" data-label="Вывод">
          {project.recommendation ? (
            <RecommendationBadge value={project.recommendation} />
          ) : (
            '—'
          )}
        </span>
      </Link>
      {onDelete && (
        <button type="button" className="btn btn--ghost project-delete" onClick={handleDelete}>
          Удалить
        </button>
      )}
    </div>
    )
  }

  return (
    <div className="project-card-wrap">
    <Link to={`/projects/${project.id}`} className={`card project-card project-card--${project.concessionFit ?? 'none'}`}>
      <div className="project-card__head">
        {rank != null && <span className="rank">#{rank}</span>}
        <FitBadge value={project.concessionFit} />
        <StatusBadge status={project.status} />
        {project.concessionScore != null && <span className="score">балл {project.concessionScore}</span>}
      </div>
      <h3>{project.name || 'Без названия'}</h3>
      <p className="project-card__meta">
        {project.industry || 'Отрасль не извлечена'}
        <span aria-hidden="true"> · </span>
        <IconPin className="inline-icon" />
        {[project.country, project.region].filter(Boolean).join(', ') || 'локация не извлечена'}
      </p>
      <div className="project-card__budget">
        <IconWallet className="inline-icon" />
        {formatBudget(project.budget)}
      </div>
      {project.status === 'processing' && (
        <div className="progress" aria-label={`Прогресс ${project.progress}%`}>
          <span style={{ width: `${project.progress}%` }} />
        </div>
      )}
      <div className="project-card__foot">
        <span>{project.fileName ?? 'файл не загружен'}</span>
        <span>{formatDate(project.updatedAt)}</span>
      </div>
      {project.recommendation && (
        <div className="project-card__rec">
          <RecommendationBadge value={project.recommendation} />
        </div>
      )}
    </Link>
      {onDelete && (
        <button type="button" className="btn btn--ghost project-delete" onClick={handleDelete}>
          Удалить
        </button>
      )}
    </div>
  )
}
