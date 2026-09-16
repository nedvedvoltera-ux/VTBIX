import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  DEBT_LABEL,
  FEDERAL_DISTRICTS,
  FIN_LABEL,
  FIT_LABEL,
  OUTLOOK_LABEL,
  REGION_RATINGS,
} from '../data/regions'
import type { ConcessionFit } from '../types'
import { FitBadge } from '../components/StatusBadge'
import { IconSearch } from '../components/Icons'
import { formatBln, formatPct } from '../utils/concession'
import { FIT_FILTERS } from '../data/mock'

export function RegionsPage() {
  const [query, setQuery] = useState('')
  const [fit, setFit] = useState<'all' | ConcessionFit>('all')
  const [district, setDistrict] = useState('all')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return REGION_RATINGS.filter((region) => {
      if (fit !== 'all' && region.concessionFit !== fit) return false
      if (district !== 'all' && region.federalDistrict !== district) return false
      if (!q) return true
      return `${region.subject} ${region.innExecutive} ${region.innFinance} ${region.acra2025}`.toLowerCase().includes(q)
    })
  }, [query, fit, district])

  const stats = useMemo(() => {
    return {
      advantageous: REGION_RATINGS.filter((r) => r.concessionFit === 'advantageous').length,
      average: REGION_RATINGS.filter((r) => r.concessionFit === 'average').length,
      unfavorable: REGION_RATINGS.filter((r) => r.concessionFit === 'unfavorable').length,
    }
  }, [])

  return (
    <section className="page page--wide">
      <div className="page-head">
        <div>
          <p className="eyebrow">Рейтинг регионов</p>
          <h1>Фискальная устойчивость субъектов РФ</h1>
          <p className="lede">
            Светофор показывает, насколько регион привлекателен как публичный партнёр по концессии: платёжеспособность,
            долг и рейтинг АКРА. Нажмите на субъект — откроется справка.
          </p>
        </div>
      </div>

      <div className="legend">
        <span className="legend__item legend__item--ok">Выгодно · {stats.advantageous}</span>
        <span className="legend__item legend__item--warn">Средне · {stats.average}</span>
        <span className="legend__item legend__item--danger">Невыгодно · {stats.unfavorable}</span>
        <span className="hint">Мок-данные по методологии Минфина / АКРА, не официальная выгрузка.</span>
      </div>

      <div className="filters">
        <label className="search">
          <IconSearch />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Субъект РФ, ИНН, рейтинг АКРА" />
        </label>
        <div className="chips" role="tablist" aria-label="Выгода концессионера">
          {FIT_FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`chip ${fit === item.id ? 'is-on' : ''}`}
              onClick={() => setFit(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="filter-row">
          <label>
            Федеральный округ
            <select value={district} onChange={(e) => setDistrict(e.target.value)}>
              <option value="all">Все округа</option>
              {FEDERAL_DISTRICTS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="filters__foot">
          <span>
            Показано {filtered.length} из {REGION_RATINGS.length} субъектов
          </span>
        </div>
      </div>

      <p className="hint regions-scroll-hint">На телефоне — карточки. Полная таблица Минфина доступна на широком экране или в справке субъекта.</p>

      <div className="regions-cards">
        {filtered.map((region) => (
          <Link key={region.id} to={`/regions/${region.id}`} className={`card region-card region-card--${region.concessionFit}`}>
            <div className="region-card__top">
              <FitBadge value={region.concessionFit} />
              <span className="hint">{region.federalDistrict} ФО</span>
            </div>
            <h3>{region.subject}</h3>
            <dl className="region-card__facts">
              <div>
                <dt>АКРА 2025</dt>
                <dd>{region.acra2025}</dd>
              </div>
              <div>
                <dt>Прогноз</dt>
                <dd>{OUTLOOK_LABEL[region.acraOutlook]}</dd>
              </div>
              <div>
                <dt>Долг / свои доходы</dt>
                <dd>{formatPct(region.debtToOwnRevenue)}</dd>
              </div>
              <div>
                <dt>Финсостояние</dt>
                <dd>{FIN_LABEL[region.finState]}</dd>
              </div>
            </dl>
          </Link>
        ))}
      </div>

      <div className="table-scroll">
        <table className="rating-table">
          <thead>
            <tr>
              <th rowSpan={2} className="sticky">
                Субъект РФ
              </th>
              <th rowSpan={2}>Выгода</th>
              <th rowSpan={2}>ИНН ВОИВ</th>
              <th rowSpan={2}>ИНН фин. органа</th>
              <th colSpan={2}>Долговая устойчивость Минфина РФ</th>
              <th colSpan={4}>АКРА</th>
              <th colSpan={3}>Доходы и долговая нагрузка</th>
              <th rowSpan={2}>Фин. состояние</th>
              <th colSpan={3}>Доходы 2025, млрд ₽</th>
              <th colSpan={8}>Государственный долг на 01.01.26, млрд ₽</th>
            </tr>
            <tr>
              <th>2024–2025 (сент. 2024)</th>
              <th>2025–2026 (сент. 2025)</th>
              <th>2024</th>
              <th>2025 (17.03.26)</th>
              <th>Прогноз</th>
              <th>Дата</th>
              <th>Доля собств. доходов в общих, факт 2025</th>
              <th>Долг 01.01.26 / собств. доходы 2025</th>
              <th>Доля коммерч. долга 01.01.26 / собств. доходы 2025</th>
              <th>Всего</th>
              <th>Безвозмездные</th>
              <th>Собственные</th>
              <th>Всего</th>
              <th>Коммерческий*</th>
              <th>Бюджетные кредиты</th>
              <th>Кредиты банков</th>
              <th>Ценные бумаги</th>
              <th>Гарантии</th>
              <th>Зона муниципалитетов</th>
              <th>Для «красных»</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((region) => (
              <tr key={region.id} className={`fit-row fit-row--${region.concessionFit}`}>
                <th className="sticky">
                  <Link to={`/regions/${region.id}`}>{region.subject}</Link>
                  <em>{region.federalDistrict} ФО</em>
                </th>
                <td>
                  <FitBadge value={region.concessionFit} />
                </td>
                <td className="mono">{region.innExecutive}</td>
                <td className="mono">{region.innFinance}</td>
                <td>
                  <span className={`tone tone--${region.debtSustain2425}`}>{DEBT_LABEL[region.debtSustain2425]}</span>
                </td>
                <td>
                  <span className={`tone tone--${region.debtSustain2526}`}>{DEBT_LABEL[region.debtSustain2526]}</span>
                </td>
                <td>{region.acra2024}</td>
                <td>{region.acra2025}</td>
                <td>{OUTLOOK_LABEL[region.acraOutlook]}</td>
                <td>{region.acraDate}</td>
                <td>{formatPct(region.ownRevenueShare2025)}</td>
                <td>{formatPct(region.debtToOwnRevenue)}</td>
                <td>{formatPct(region.commercialDebtShare)}</td>
                <td>
                  <span className={`tone tone--${region.finState}`}>{FIN_LABEL[region.finState]}</span>
                </td>
                <td>{formatBln(region.revenuesTotal)}</td>
                <td>{formatBln(region.revenuesGrants)}</td>
                <td>{formatBln(region.revenuesOwn)}</td>
                <td>{formatBln(region.debtTotal)}</td>
                <td>{formatBln(region.debtCommercial)}</td>
                <td>{formatBln(region.debtBudgetLoans)}</td>
                <td>{formatBln(region.debtBankLoans)}</td>
                <td>{formatBln(region.debtSecurities)}</td>
                <td>{formatBln(region.debtGuarantees)}</td>
                <td>{formatBln(region.debtMunicipalZone)}</td>
                <td>{formatBln(region.debtRedZone)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint">
        *Коммерческий долг — кредиты банков, ценные бумаги и гарантии. «Красные» — муниципалитеты с плохим финансовым
        состоянием. {FIT_LABEL.advantageous} / {FIT_LABEL.average} / {FIT_LABEL.unfavorable} — оценка для концессионера.
      </p>
    </section>
  )
}
