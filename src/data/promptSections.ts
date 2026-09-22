import type { PromptSectionId } from '../types'

export const PROMPT_SECTIONS: { id: PromptSectionId; title: string; hint: string }[] = [
  { id: 'executive', title: 'Резюме для руководства', hint: '1 страница: суть, цифры, рекомендация' },
  { id: 'description', title: 'Описание проекта', hint: 'что строится, сроки; оценка закона, ПД/ЗУ и выгодности для инвестора' },
  { id: 'industry', title: 'Отраслевой контекст', hint: 'рынок, конкуренция, регуляторика' },
  { id: 'location', title: 'Локация и инфраструктура', hint: 'страна, регион, логистика, кадры' },
  { id: 'budget', title: 'Бюджет и структура затрат', hint: 'CAPEX/OPEX, источники финансирования' },
  { id: 'financials', title: 'Финансовая модель', hint: 'цифры модели из документа, источники, допущения' },
  { id: 'scenarios', title: 'Сценарный анализ', hint: 'базовый / оптимистичный / стресс' },
  { id: 'risks', title: 'Риски', hint: 'матрица вероятность × влияние' },
  { id: 'comparables', title: 'Сравнение с аналогами', hint: 'benchmark по отрасли и региону' },
  { id: 'esg', title: 'ESG и комплаенс', hint: 'экология, социальные эффекты, санкционный контур' },
  { id: 'recommendation', title: 'Инвестиционная рекомендация', hint: 'инвестировать / доработать / отклонить' },
]
