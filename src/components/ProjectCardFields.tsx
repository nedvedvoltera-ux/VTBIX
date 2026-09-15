import { COUNTRIES, INDUSTRIES, REGIONS_BY_COUNTRY } from '../data/mock'
import { REGION_RATINGS } from '../data/regions'
import type { AnalyticalNote, ConcessionFit, Project, ProjectStatus, Recommendation } from '../types'
import { clampScore } from '../utils/concession'

const STATUSES: { id: ProjectStatus; label: string }[] = [
  { id: 'draft', label: 'Черновик' },
  { id: 'queued', label: 'В очереди' },
  { id: 'processing', label: 'Расчёт' },
  { id: 'ready', label: 'Готово' },
  { id: 'error', label: 'Ошибка' },
]

const FITS: { id: ConcessionFit; label: string }[] = [
  { id: 'advantageous', label: 'Выгодно' },
  { id: 'average', label: 'Средне' },
  { id: 'unfavorable', label: 'Невыгодно' },
]

const RECS: { id: Recommendation; label: string }[] = [
  { id: 'invest', label: 'Инвестировать' },
  { id: 'revise', label: 'Доработать' },
  { id: 'reject', label: 'Отклонить' },
]

export const EMPTY_NOTE: AnalyticalNote = {
  executiveSummary: '',
  description: '',
  industryContext: '',
  location: '',
  budgetBreakdown: '',
  financials: [{ metric: '', value: '', comment: '', score: undefined }],
  scenarios: [{ name: '', npv: '', irr: '' }],
  risks: [{ title: '', level: 'mid', text: '' }],
  recommendation: '',
}

function regionOptions(country: string, current: string) {
  const base = country === 'Россия' ? REGION_RATINGS.map((item) => item.subject) : (REGIONS_BY_COUNTRY[country] ?? [])
  return current && !base.includes(current) ? [current, ...base] : base
}

type Patch = <K extends keyof Project>(key: K, value: Project[K]) => void

export function ProjectCardFields({ form, patch }: { form: Project; patch: Patch }) {
  const regions = regionOptions(form.country, form.region)

  return (
    <div className="editor-grid">
      <label className="field">
        Название
        <input value={form.name} onChange={(e) => patch('name', e.target.value)} />
      </label>
      <label className="field">
        Ответственный
        <input value={form.owner} onChange={(e) => patch('owner', e.target.value)} />
      </label>
      <label className="field">
        Статус расчёта
        <select value={form.status} onChange={(e) => patch('status', e.target.value as ProjectStatus)}>
          {STATUSES.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Прогресс расчёта, %
        <input
          type="number"
          min={0}
          max={100}
          value={form.progress}
          onChange={(e) => patch('progress', Number(e.target.value))}
        />
      </label>
      <label className="field">
        Выгода для концессионера
        <select
          value={form.concessionFit ?? ''}
          onChange={(e) => patch('concessionFit', (e.target.value || undefined) as ConcessionFit | undefined)}
        >
          <option value="">Нет оценки</option>
          {FITS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Балл выгодности
        <input
          type="number"
          min={0}
          max={100}
          value={form.concessionScore ?? ''}
          onChange={(e) => patch('concessionScore', e.target.value === '' ? undefined : Number(e.target.value))}
        />
      </label>
      <label className="field">
        Вывод
        <select
          value={form.recommendation ?? ''}
          onChange={(e) => patch('recommendation', (e.target.value || undefined) as Recommendation | undefined)}
        >
          <option value="">Нет вывода</option>
          {RECS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Балл записки
        <input
          type="number"
          min={0}
          max={100}
          value={form.score ?? ''}
          onChange={(e) => patch('score', e.target.value === '' ? undefined : Number(e.target.value))}
        />
      </label>
      <label className="field">
        Отрасль
        <input
          list="industry-list"
          value={form.industry}
          onChange={(e) => patch('industry', e.target.value)}
        />
        <datalist id="industry-list">
          {INDUSTRIES.map((item) => (
            <option key={item} value={item} />
          ))}
        </datalist>
      </label>
      <label className="field">
        Страна
        <select
          value={form.country}
          onChange={(e) => {
            patch('country', e.target.value)
            patch('region', '')
          }}
        >
          <option value="">Не указана</option>
          {COUNTRIES.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Регион / субъект РФ
        <input
          list="region-list"
          value={form.region}
          onChange={(e) => patch('region', e.target.value)}
          disabled={!form.country}
        />
        <datalist id="region-list">
          {regions.map((item) => (
            <option key={item} value={item} />
          ))}
        </datalist>
      </label>
      <label className="field">
        Бюджет, ₽
        <input
          type="number"
          min={0}
          step={1000000}
          value={form.budget ?? ''}
          onChange={(e) => patch('budget', e.target.value === '' ? null : Number(e.target.value))}
        />
      </label>
      <label className="field editor-grid__full">
        Пояснения сотрудника
        <textarea rows={5} value={form.notes} onChange={(e) => patch('notes', e.target.value)} />
      </label>
    </div>
  )
}

export function NoteFields({
  note,
  onChange,
}: {
  note: AnalyticalNote
  onChange: (next: AnalyticalNote) => void
}) {
  function patch<K extends keyof AnalyticalNote>(key: K, value: AnalyticalNote[K]) {
    onChange({ ...note, [key]: value })
  }

  return (
    <div className="stack">
      <label className="field">
        Резюме
        <textarea rows={4} value={note.executiveSummary} onChange={(e) => patch('executiveSummary', e.target.value)} />
      </label>
      <label className="field">
        Описание проекта
        <textarea rows={4} value={note.description} onChange={(e) => patch('description', e.target.value)} />
      </label>
      <label className="field">
        Отраслевой контекст
        <textarea rows={4} value={note.industryContext} onChange={(e) => patch('industryContext', e.target.value)} />
      </label>
      <label className="field">
        Локация
        <textarea rows={3} value={note.location} onChange={(e) => patch('location', e.target.value)} />
      </label>
      <label className="field">
        Бюджет
        <textarea rows={3} value={note.budgetBreakdown} onChange={(e) => patch('budgetBreakdown', e.target.value)} />
      </label>

      <div className="field">
        Финансовые метрики
        {note.financials.map((row, index) => (
          <div className="inline-add inline-add--metrics" key={`fin-${index}`}>
            <input
              placeholder="Метрика"
              value={row.metric}
              onChange={(e) =>
                patch(
                  'financials',
                  note.financials.map((item, i) => (i === index ? { ...item, metric: e.target.value } : item)),
                )
              }
            />
            <input
              placeholder="Значение"
              value={row.value}
              onChange={(e) =>
                patch(
                  'financials',
                  note.financials.map((item, i) => (i === index ? { ...item, value: e.target.value } : item)),
                )
              }
            />
            <input
              type="number"
              min={0}
              max={100}
              placeholder="Балл 0–100"
              value={row.score ?? ''}
              onChange={(e) =>
                patch(
                  'financials',
                  note.financials.map((item, i) =>
                    i === index
                      ? { ...item, score: e.target.value === '' ? undefined : clampScore(Number(e.target.value)) }
                      : item,
                  ),
                )
              }
            />
            <input
              placeholder="Комментарий"
              value={row.comment}
              onChange={(e) =>
                patch(
                  'financials',
                  note.financials.map((item, i) => (i === index ? { ...item, comment: e.target.value } : item)),
                )
              }
            />
          </div>
        ))}
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => patch('financials', [...note.financials, { metric: '', value: '', comment: '', score: undefined }])}
        >
          Добавить метрику
        </button>
      </div>

      <div className="field">
        Сценарии
        {note.scenarios.map((row, index) => (
          <div className="inline-add" key={`sc-${index}`}>
            <input
              placeholder="Сценарий"
              value={row.name}
              onChange={(e) =>
                patch(
                  'scenarios',
                  note.scenarios.map((item, i) => (i === index ? { ...item, name: e.target.value } : item)),
                )
              }
            />
            <input
              placeholder="NPV"
              value={row.npv}
              onChange={(e) =>
                patch(
                  'scenarios',
                  note.scenarios.map((item, i) => (i === index ? { ...item, npv: e.target.value } : item)),
                )
              }
            />
            <input
              placeholder="IRR"
              value={row.irr}
              onChange={(e) =>
                patch(
                  'scenarios',
                  note.scenarios.map((item, i) => (i === index ? { ...item, irr: e.target.value } : item)),
                )
              }
            />
          </div>
        ))}
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => patch('scenarios', [...note.scenarios, { name: '', npv: '', irr: '' }])}
        >
          Добавить сценарий
        </button>
      </div>

      <div className="field">
        Риски
        {note.risks.map((row, index) => (
          <div className="inline-add" key={`rk-${index}`}>
            <input
              placeholder="Риск"
              value={row.title}
              onChange={(e) =>
                patch(
                  'risks',
                  note.risks.map((item, i) => (i === index ? { ...item, title: e.target.value } : item)),
                )
              }
            />
            <select
              value={row.level}
              onChange={(e) =>
                patch(
                  'risks',
                  note.risks.map((item, i) =>
                    i === index ? { ...item, level: e.target.value as 'low' | 'mid' | 'high' } : item,
                  ),
                )
              }
            >
              <option value="low">Низкий</option>
              <option value="mid">Средний</option>
              <option value="high">Высокий</option>
            </select>
            <input
              placeholder="Комментарий"
              value={row.text}
              onChange={(e) =>
                patch(
                  'risks',
                  note.risks.map((item, i) => (i === index ? { ...item, text: e.target.value } : item)),
                )
              }
            />
          </div>
        ))}
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => patch('risks', [...note.risks, { title: '', level: 'mid', text: '' }])}
        >
          Добавить риск
        </button>
      </div>

      <label className="field">
        Рекомендация в записке
        <textarea rows={4} value={note.recommendation} onChange={(e) => patch('recommendation', e.target.value)} />
      </label>
    </div>
  )
}
