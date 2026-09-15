import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { DEFAULT_METRICS, PROMPT_SECTIONS } from '../data/mock'
import type { MetricWeight, OutputFormat, PromptConfig, PromptDepth, PromptSectionId, PromptTone, RecommendationStyle } from '../types'
import { applyRanking, clampScore, DEFAULT_METRIC_WEIGHT, metricKey } from '../utils/concession'
import { buildPromptPreview } from '../utils/promptBuilder'

const TONES: { id: PromptTone; label: string; hint: string }[] = [
  { id: 'formal', label: 'Служебный', hint: 'нейтральный тон финблока' },
  { id: 'board', label: 'Для комитета', hint: 'коротко, к решению' },
  { id: 'brief', label: 'Справка', hint: 'только факты и вывод' },
]

const DEPTHS: { id: PromptDepth; label: string }[] = [
  { id: 'brief', label: 'Кратко' },
  { id: 'standard', label: 'Стандарт' },
  { id: 'deep', label: 'Глубоко' },
]

const FORMATS: { id: OutputFormat; label: string }[] = [
  { id: 'memo', label: 'Записка' },
  { id: 'slides-outline', label: 'Конспект слайдов' },
  { id: 'table-first', label: 'Сначала таблицы' },
]

const REC_STYLES: { id: RecommendationStyle; label: string }[] = [
  { id: 'traffic', label: 'Светофор: инвестировать / доработать / отклонить' },
  { id: 'narrative', label: 'Связный вердикт без статусов' },
]

export function PromptMasterPage() {
  const { prompt, setPrompt, resetPrompt, projects } = useApp()
  const [saved, setSaved] = useState(false)
  const [metricDraft, setMetricDraft] = useState('')
  const sample = projects.find((item) => item.status === 'ready') ?? projects[0]

  const preview = useMemo(() => buildPromptPreview(prompt, sample), [prompt, sample])
  const enabledCount = Object.values(prompt.sections).filter(Boolean).length
  const weightSum = prompt.metrics.reduce((sum, item) => sum + item.weight, 0)
  const rankingPreview = useMemo(
    () =>
      [...projects]
        .map((item) => applyRanking(item, prompt.metrics))
        .sort((a, b) => (b.concessionScore ?? -1) - (a.concessionScore ?? -1))
        .slice(0, 5),
    [projects, prompt.metrics],
  )

  function patch(partial: Partial<PromptConfig>) {
    setSaved(false)
    setPrompt({ ...prompt, ...partial })
  }

  function toggleSection(id: PromptSectionId) {
    const next = { ...prompt.sections, [id]: !prompt.sections[id] }
    patch({
      sections: next,
      includeComparables: id === 'comparables' ? next.comparables : prompt.includeComparables,
      includeEsg: id === 'esg' ? next.esg : prompt.includeEsg,
    })
  }

  function addMetric() {
    const value = metricDraft.trim()
    if (!value) return
    const key = metricKey(value)
    if (prompt.metrics.some((item) => metricKey(item.name) === key)) return
    patch({ metrics: [...prompt.metrics, { name: value, weight: DEFAULT_METRIC_WEIGHT }] })
    setMetricDraft('')
  }

  function patchMetric(index: number, partial: Partial<MetricWeight>) {
    patch({
      metrics: prompt.metrics.map((item, i) => (i === index ? { ...item, ...partial } : item)),
    })
  }

  function removeMetric(index: number) {
    patch({ metrics: prompt.metrics.filter((_, i) => i !== index) })
  }

  function save() {
    setPrompt({ ...prompt, includeComparables: prompt.sections.comparables, includeEsg: prompt.sections.esg })
    setSaved(true)
  }

  return (
    <section className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">Настройки</p>
          <h1>Мастер промпта</h1>
          <p className="lede">
            Соберите инструкцию, по которой модель готовит аналитическую записку. Превью справа собирается из ваших
            переключателей и подставляет пример объекта из периметра.
          </p>
        </div>
        <div className="actions">
          <button type="button" className="btn btn--ghost" onClick={() => { resetPrompt(); setSaved(false) }}>
            Сбросить
          </button>
          <button type="button" className="btn btn--primary" onClick={save}>
            {saved ? 'Сохранено' : 'Сохранить настройки'}
          </button>
        </div>
      </div>

      <div className="split split--prompt">
        <div className="stack">
          <div className="card settings-block">
            <h2>Роль и рамка</h2>
            <label className="field">
              Системная роль
              <textarea rows={4} value={prompt.role} onChange={(e) => patch({ role: e.target.value })} />
            </label>
            <div className="filter-row">
              <label>
                Язык записки
                <select
                  value={prompt.language}
                  onChange={(e) => patch({ language: e.target.value as PromptConfig['language'] })}
                >
                  <option value="ru">Русский</option>
                  <option value="en">English</option>
                </select>
              </label>
              <label>
                Формат вывода
                <select
                  value={prompt.outputFormat}
                  onChange={(e) => patch({ outputFormat: e.target.value as OutputFormat })}
                >
                  {FORMATS.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="card settings-block">
            <h2>Тон и глубина</h2>
            <div className="chips">
              {TONES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`chip ${prompt.tone === item.id ? 'is-on' : ''}`}
                  onClick={() => patch({ tone: item.id })}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <p className="hint">{TONES.find((item) => item.id === prompt.tone)?.hint}</p>
            <div className="chips">
              {DEPTHS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`chip ${prompt.depth === item.id ? 'is-on' : ''}`}
                  onClick={() => patch({ depth: item.id })}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="card settings-block">
            <h2>Структура записки · {enabledCount} разделов</h2>
            <ul className="section-list">
              {PROMPT_SECTIONS.map((section) => (
                <li key={section.id}>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={prompt.sections[section.id]}
                      onChange={() => toggleSection(section.id)}
                    />
                    <span>
                      <strong>{section.title}</strong>
                      <em>{section.hint}</em>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>

          <div className="card settings-block">
            <h2>Метрики и веса ранжирования</h2>
            <p className="hint">
              Вес — вклад метрики в итоговый балл на главной. Балл по самой метрике (0–100) ставится в карточке проекта.
              Порядок объектов пересчитывается сразу.
            </p>
            <ul className="metric-weights">
              {prompt.metrics.map((metric, index) => (
                <li key={`${metric.name}-${index}`}>
                  <strong>{metric.name}</strong>
                  <label>
                    Вес
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={metric.weight}
                      onChange={(e) => patchMetric(index, { weight: clampScore(Number(e.target.value)) })}
                    />
                  </label>
                  <input
                    className="metric-weights__num"
                    type="number"
                    min={0}
                    max={100}
                    value={metric.weight}
                    onChange={(e) =>
                      patchMetric(index, { weight: e.target.value === '' ? 0 : clampScore(Number(e.target.value)) })
                    }
                  />
                  <button type="button" className="chip chip--dismiss" onClick={() => removeMetric(index)}>
                    ×
                  </button>
                </li>
              ))}
            </ul>
            <div className="inline-add">
              <input
                value={metricDraft}
                list="metrics-list"
                placeholder="Добавить метрику"
                onChange={(e) => setMetricDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addMetric()
                  }
                }}
              />
              <datalist id="metrics-list">
                {DEFAULT_METRICS.map((item) => (
                  <option key={item.name} value={item.name} />
                ))}
              </datalist>
              <button type="button" className="btn" onClick={addMetric}>
                Добавить
              </button>
            </div>
            <p className="hint">Сумма весов: {weightSum}. Нулевой вес оставляет метрику в записке, но не двигает рейтинг.</p>
            {rankingPreview.length > 0 && (
              <>
                <p className="field-label">Текущий порядок на главной</p>
                <ol className="ranking-preview">
                  {rankingPreview.map((item, index) => (
                    <li key={item.id}>
                      <span>#{index + 1}</span>
                      <Link to={`/projects/${item.id}`}>{item.name || 'Без названия'}</Link>
                      <em>{item.concessionScore != null ? `балл ${item.concessionScore}` : 'нет балла'}</em>
                    </li>
                  ))}
                </ol>
              </>
            )}

            <label className="check">
              <input
                type="checkbox"
                checked={prompt.useEmployeeNotes}
                onChange={(e) => patch({ useEmployeeNotes: e.target.checked })}
              />
              <span>
                <strong>Приоритет пояснений сотрудника</strong>
                <em>расхождения с файлом модель обязана пометить</em>
              </span>
            </label>

            <p className="field-label">Стиль рекомендации</p>
            <div className="chips">
              {REC_STYLES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`chip ${prompt.recommendationStyle === item.id ? 'is-on' : ''}`}
                  onClick={() => patch({ recommendationStyle: item.id })}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <label className="field">
              Особые указания
              <textarea
                rows={5}
                value={prompt.extraInstructions}
                onChange={(e) => patch({ extraInstructions: e.target.value })}
                placeholder="Например: не оценивай ESG; всегда указывай валюту модели; если нет WACC — возьми отраслевой ориентир и пометь как допущение."
              />
            </label>
          </div>
        </div>

        <aside className="prompt-preview">
          <div className="prompt-preview__bar">
            <h2>Превью промпта</h2>
            <span className="pill">живой черновик</span>
          </div>
          <pre>{preview}</pre>
        </aside>
      </div>
    </section>
  )
}
