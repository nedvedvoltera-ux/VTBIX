import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { BUDGET_FILTERS, COUNTRIES, FIT_FILTERS, INDUSTRIES, REGIONS_BY_COUNTRY, STATUS_FILTERS } from '../data/mock'
import type { ConcessionFit, ProjectStatus } from '../types'
import { applyRanking } from '../utils/concession'
import { ProjectCard, type ProjectView } from '../components/ProjectCard'
import { IconGrid, IconPlus, IconRows, IconSearch } from '../components/Icons'

const VIEW_KEY = 'vtbih.projectsView'

function readView(): ProjectView {
  try {
    const stored = localStorage.getItem(VIEW_KEY)
    return stored === 'row' || stored === 'tile' ? stored : 'row'
  } catch {
    return 'row'
  }
}

export function ProjectsPage() {
  const { projects, prompt } = useApp()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'all' | ProjectStatus>('all')
  const [fit, setFit] = useState<'all' | ConcessionFit>('all')
  const [industry, setIndustry] = useState('all')
  const [country, setCountry] = useState('all')
  const [region, setRegion] = useState('all')
  const [budget, setBudget] = useState('all')
  const [view, setView] = useState<ProjectView>(readView)

  function changeView(next: ProjectView) {
    setView(next)
    localStorage.setItem(VIEW_KEY, next)
  }

  const industries = useMemo(() => {
    const extra = projects.map((p) => p.industry).filter(Boolean)
    return Array.from(new Set([...INDUSTRIES, ...extra]))
  }, [projects])

  const regions = country === 'all' ? [] : (REGIONS_BY_COUNTRY[country] ?? [])

  const rankedProjects = useMemo(
    () => projects.map((project) => applyRanking(project, prompt.metrics)),
    [projects, prompt.metrics],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const range = BUDGET_FILTERS.find((item) => item.id === budget)
    const ranked = rankedProjects.filter((project) => {
      if (status !== 'all' && project.status !== status) return false
      if (fit !== 'all' && project.concessionFit !== fit) return false
      if (industry !== 'all' && project.industry !== industry) return false
      if (country !== 'all' && project.country !== country) return false
      if (region !== 'all' && project.region !== region) return false
      if (range && project.budget != null && (project.budget < range.min || project.budget >= range.max)) return false
      if (range && project.budget == null) return false
      if (!q) return true
      const blob = [project.name, project.industry, project.country, project.region, project.fileName, project.notes]
        .join(' ')
        .toLowerCase()
      return blob.includes(q)
    })
    return [...ranked].sort((a, b) => (b.concessionScore ?? -1) - (a.concessionScore ?? -1))
  }, [rankedProjects, query, status, fit, industry, country, region, budget])

  const stats = useMemo(() => {
    const advantageous = rankedProjects.filter((p) => p.concessionFit === 'advantageous').length
    const average = rankedProjects.filter((p) => p.concessionFit === 'average').length
    const unfavorable = rankedProjects.filter((p) => p.concessionFit === 'unfavorable').length
    return { advantageous, average, unfavorable }
  }, [rankedProjects])

  function resetFilters() {
    setQuery('')
    setStatus('all')
    setFit('all')
    setIndustry('all')
    setCountry('all')
    setRegion('all')
    setBudget('all')
  }

  return (
    <section className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">Объекты анализа</p>
          <h1>Ранжирование концессий</h1>
          <p className="lede">
            Система ищет выгодные концессионные соглашения для концессионера. Порядок задают веса метрик в мастере
            промпта и баллы по этим метрикам в карточке проекта.
          </p>
        </div>
        <Link to="/projects/new" className="btn btn--primary">
          <IconPlus />
          Загрузить проект
        </Link>
      </div>

      <div className="stats">
        <article className="stat">
          <span>Всего объектов</span>
          <strong>{projects.length}</strong>
        </article>
        <article className="stat stat--ok">
          <span>Выгодно концессионеру</span>
          <strong>{stats.advantageous}</strong>
        </article>
        <article className="stat stat--warn">
          <span>Средняя выгода</span>
          <strong>{stats.average}</strong>
        </article>
        <article className="stat stat--danger">
          <span>Невыгодно</span>
          <strong>{stats.unfavorable}</strong>
        </article>
      </div>

      <div className="filters">
        <label className="search">
          <IconSearch />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по названию, файлу, пояснениям"
          />
        </label>

        <div className="chips" role="tablist" aria-label="Выгодность для концессионера">
          {FIT_FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`chip chip--fit-${item.id} ${fit === item.id ? 'is-on' : ''}`}
              onClick={() => setFit(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="chips" role="tablist" aria-label="Статус расчёта">
          {STATUS_FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`chip ${status === item.id ? 'is-on' : ''}`}
              onClick={() => setStatus(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="filter-row">
          <label>
            Отрасль
            <select
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
            >
              <option value="all">Все отрасли</option>
              {industries.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label>
            Страна
            <select
              value={country}
              onChange={(e) => {
                setCountry(e.target.value)
                setRegion('all')
              }}
            >
              <option value="all">Все страны</option>
              {COUNTRIES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label>
            Регион
            <select value={region} onChange={(e) => setRegion(e.target.value)} disabled={country === 'all'}>
              <option value="all">Все регионы</option>
              {regions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label>
            Бюджет
            <select value={budget} onChange={(e) => setBudget(e.target.value)}>
              <option value="all">Любой бюджет</option>
              {BUDGET_FILTERS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="filters__foot">
          <span>
            Показано {filtered.length} из {projects.length}
          </span>
          <div className="view-toggle" role="group" aria-label="Вид списка">
            <button
              type="button"
              className={view === 'tile' ? 'is-on' : ''}
              aria-pressed={view === 'tile'}
              onClick={() => changeView('tile')}
            >
              <IconGrid />
              Плитка
            </button>
            <button
              type="button"
              className={view === 'row' ? 'is-on' : ''}
              aria-pressed={view === 'row'}
              onClick={() => changeView('row')}
            >
              <IconRows />
              Строки
            </button>
          </div>
          <button type="button" className="btn btn--ghost" onClick={resetFilters}>
            Сбросить фильтры
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty">
          <h3>Ничего не найдено</h3>
          <p>Снимите часть фильтров или загрузите новый проект.</p>
        </div>
      ) : view === 'tile' ? (
        <div className="grid">
          {filtered.map((project, index) => (
            <ProjectCard key={project.id} project={project} variant="tile" rank={index + 1} />
          ))}
        </div>
      ) : (
        <div className="rows">
          <div className="rows__head" aria-hidden="true">
            <span>Приоритет</span>
            <span>Проект</span>
            <span>Расчёт</span>
            <span>Отрасль</span>
            <span>Локация</span>
            <span>Бюджет</span>
            <span>Обновлён</span>
            <span>Вывод</span>
          </div>
          {filtered.map((project, index) => (
            <ProjectCard key={project.id} project={project} variant="row" rank={index + 1} />
          ))}
        </div>
      )}
    </section>
  )
}
