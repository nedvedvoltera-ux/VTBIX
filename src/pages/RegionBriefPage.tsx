import { Link, useParams } from 'react-router-dom'
import { DEBT_LABEL, FIN_LABEL, OUTLOOK_LABEL, getRegionById } from '../data/regions'
import { FitBadge } from '../components/StatusBadge'
import { formatBln, formatPct } from '../utils/concession'

export function RegionBriefPage() {
  const { id } = useParams()
  const region = id ? getRegionById(id) : undefined

  if (!region) {
    return (
      <section className="page">
        <div className="empty">
          <h3>Регион не найден</h3>
          <Link to="/regions" className="btn">
            К рейтингу
          </Link>
        </div>
      </section>
    )
  }

  return (
    <section className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">
            <Link to="/regions">Рейтинг регионов</Link>
            <span> / справка</span>
          </p>
          <h1>{region.subject}</h1>
          <div className="meta-line">
            <FitBadge value={region.concessionFit} />
            <span>{region.federalDistrict} федеральный округ</span>
          </div>
        </div>
        <Link to="/regions" className="btn">
          Назад к таблице
        </Link>
      </div>

      <div className="banner">
        <div>
          <strong>Каркас справки</strong>
          <p>
            Форму справки подключим отдельно. Сейчас здесь паспорт субъекта и цифры рейтинга — чтобы клик по региону уже
            открывал карточку.
          </p>
        </div>
      </div>

      <div className="facts">
        <article>
          <span>ИНН ВОИВ</span>
          <strong>{region.innExecutive}</strong>
        </article>
        <article>
          <span>ИНН финансового органа</span>
          <strong>{region.innFinance}</strong>
        </article>
        <article>
          <span>АКРА 2025</span>
          <strong>
            {region.acra2025} · {OUTLOOK_LABEL[region.acraOutlook]}
          </strong>
        </article>
        <article>
          <span>Фин. состояние</span>
          <strong>{FIN_LABEL[region.finState]}</strong>
        </article>
      </div>

      <div className="split">
        <article className="note">
          <header className="note__hero">
            <p className="eyebrow">Справка по региону</p>
            <h2>Паспорт для концессионера</h2>
            <p>
              Публичный партнёр: {region.subject}. Долговая устойчивость Минфина на 2025–2026 —{' '}
              {DEBT_LABEL[region.debtSustain2526].toLowerCase()} уровень. Доля собственных доходов {formatPct(region.ownRevenueShare2025)},
              долг к собственным доходам {formatPct(region.debtToOwnRevenue)}.
            </p>
          </header>
          <section>
            <h3>Бюджет 2025</h3>
            <p>
              Всего {formatBln(region.revenuesTotal)}, из них собственные {formatBln(region.revenuesOwn)}, безвозмездные{' '}
              {formatBln(region.revenuesGrants)}.
            </p>
          </section>
          <section>
            <h3>Госдолг на 01.01.26</h3>
            <p>
              Всего {formatBln(region.debtTotal)}, в том числе коммерческий {formatBln(region.debtCommercial)}, бюджетные
              кредиты {formatBln(region.debtBudgetLoans)}, кредиты банков {formatBln(region.debtBankLoans)}, ценные бумаги{' '}
              {formatBln(region.debtSecurities)}, гарантии {formatBln(region.debtGuarantees)}, зона муниципалитетов{' '}
              {formatBln(region.debtMunicipalZone)}, для «красных» {formatBln(region.debtRedZone)}.
            </p>
          </section>
          <section className="brief-placeholder">
            <h3>Концессионный климат</h3>
            <p>Раздел будет заполнен по вашей форме справки.</p>
          </section>
          <section className="brief-placeholder">
            <h3>Риски платёжной дисциплины</h3>
            <p>Раздел будет заполнен по вашей форме справки.</p>
          </section>
          <section className="brief-placeholder">
            <h3>Вывод для концессионера</h3>
            <p>Раздел будет заполнен по вашей форме справки.</p>
          </section>
        </article>
        <aside className="panel">
          <h2>Коды и рейтинги</h2>
          <p className="notes-body">
            АКРА 2024: {region.acra2024}
            {'\n'}АКРА 2025: {region.acra2025} ({region.acraDate})
            {'\n'}Прогноз: {OUTLOOK_LABEL[region.acraOutlook]}
            {'\n'}Устойчивость 2024–2025: {DEBT_LABEL[region.debtSustain2425]}
            {'\n'}Устойчивость 2025–2026: {DEBT_LABEL[region.debtSustain2526]}
          </p>
        </aside>
      </div>
    </section>
  )
}
