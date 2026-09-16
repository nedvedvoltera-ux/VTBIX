import { CRM_STAGES } from '../data/mock'
import { stageCounts } from '../data/crmDemo'
import type { CrmDeal, CrmStage } from '../types'

export function CrmFunnel({
  deals,
  active,
  onPick,
}: {
  deals: CrmDeal[]
  active: 'all' | CrmStage
  onPick: (stage: 'all' | CrmStage) => void
}) {
  const rows = stageCounts(deals, CRM_STAGES)
  const open = deals.filter((item) => item.stage !== 'won' && item.stage !== 'lost').length
  const overdue = deals.filter((item) => item.nextTouchAt && Date.parse(item.nextTouchAt) < Date.now()).length

  return (
    <section className="crm-funnel" aria-label="Воронка CRM">
      <div className="crm-funnel__head">
        <div>
          <p className="eyebrow">Пайплайн</p>
          <h2>Где сейчас масса клиентов</h2>
          <p className="hint">
            {deals.length} карточек · в работе {open} · просроченных касаний {overdue}. Нажмите стадию, чтобы отфильтровать.
          </p>
        </div>
        {active !== 'all' && (
          <button type="button" className="btn btn--ghost" onClick={() => onPick('all')}>
            Вся воронка
          </button>
        )}
      </div>
      <div className="crm-funnel__mass" role="img" aria-label="Доля карточек по стадиям">
        {rows.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`crm-funnel__fill crm-funnel__fill--${item.id} ${active === item.id ? 'is-on' : ''}`}
            style={{ flexGrow: item.count || 0.35 }}
            title={`${item.label}: ${item.count}`}
            onClick={() => onPick(active === item.id ? 'all' : item.id)}
          >
            {item.count > 0 && <span>{item.count}</span>}
          </button>
        ))}
      </div>
      <div className="crm-funnel__pipe">
        {rows.map((item, index) => (
          <button
            key={item.id}
            type="button"
            className={`crm-funnel__step crm-funnel__step--${item.id} ${active === item.id ? 'is-on' : ''}`}
            onClick={() => onPick(active === item.id ? 'all' : item.id)}
          >
            {index > 0 && <span className="crm-funnel__arrow" aria-hidden="true" />}
            <span className="crm-funnel__label">{item.label}</span>
            <strong>{item.count}</strong>
            <em>{item.share}%</em>
            <span className="crm-funnel__meter" aria-hidden="true">
              <span style={{ width: `${item.share}%` }} />
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}
