import { useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import { DEFAULT_METRICS, PROMPT_SECTIONS } from '../data/mock'
import type { OutputFormat, PromptConfig, PromptDepth, PromptSectionId, PromptTone, RecommendationStyle } from '../types'
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
    if (!value || prompt.metrics.includes(value)) return
    patch({ metrics: [...prompt.metrics, value] })
    setMetricDraft('')
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
            <h2>Метрики и правила</h2>
            <div className="chips">
              {prompt.metrics.map((metric) => (
                <button
                  key={metric}
                  type="button"
                  className="chip is-on chip--dismiss"
                  onClick={() => patch({ metrics: prompt.metrics.filter((item) => item !== metric) })}
                >
                  {metric} ×
                </button>
              ))}
            </div>
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
                  <option key={item} value={item} />
                ))}
              </datalist>
              <button type="button" className="btn" onClick={addMetric}>
                Добавить
              </button>
            </div>

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
