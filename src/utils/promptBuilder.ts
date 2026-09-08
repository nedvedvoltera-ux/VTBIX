import { PROMPT_SECTIONS } from '../data/mock'
import type { Project, PromptConfig } from '../types'
import { formatBudget } from './format'

const TONE_LABEL: Record<PromptConfig['tone'], string> = {
  formal: 'деловой служебный стиль, без эмоций и маркетинговых формулировок',
  board: 'стиль доклада инвесткомитету: коротко, с акцентом на решение',
  brief: 'сжатая справка: только факты, цифры и вывод',
}

const DEPTH_LABEL: Record<PromptConfig['depth'], string> = {
  brief: 'краткий разбор, до 1,5 страниц',
  standard: 'стандартная записка, 3–5 страниц',
  deep: 'глубокий разбор с приложениями по чувствительности',
}

const FORMAT_LABEL: Record<PromptConfig['outputFormat'], string> = {
  memo: 'служебная записка с нумерованными разделами',
  'slides-outline': 'структура как конспект слайдов: тезис → цифра → вывод',
  'table-first': 'сначала таблицы метрик и рисков, затем комментарий',
}

export function buildPromptPreview(config: PromptConfig, sample?: Project | null): string {
  const enabled = PROMPT_SECTIONS.filter((section) => config.sections[section.id])
  const lang = config.language === 'ru' ? 'русском' : 'английском'
  const notesRule = config.useEmployeeNotes
    ? 'Пояснения сотрудника финансового отдела имеют приоритет над извлечёнными из файла гипотезами. Расхождения помечай явно.'
    : 'Пояснения сотрудника используй только как справочный контекст.'

  const recRule =
    config.recommendationStyle === 'traffic'
      ? 'Итоговая рекомендация — один из трёх статусов: инвестировать / доработать / отклонить, плюс 2–4 условия.'
      : 'Итоговая рекомендация — связный абзац с аргументами «за» и «против», без светофора.'

  const extras: string[] = []
  if (config.includeComparables) extras.push('добавь блок сравнения с отраслевыми аналогами')
  if (config.includeEsg) extras.push('включи ESG и санкционный контур')

  const projectBlock = sample
    ? [
        '',
        '--- вложение (пример объекта) ---',
        `Название: ${sample.name}`,
        `Отрасль: ${sample.industry || 'не извлечена'}`,
        `Локация: ${[sample.country, sample.region].filter(Boolean).join(', ') || 'не извлечена'}`,
        `Бюджет: ${formatBudget(sample.budget)}`,
        `Файл: ${sample.fileName ?? 'не загружен'}`,
        sample.notes ? `Пояснения сотрудника: ${sample.notes}` : 'Пояснения сотрудника: нет',
      ].join('\n')
    : ''

  return [
    `Ты — ${config.role}`,
    '',
    `Пиши на ${lang} языке, ${TONE_LABEL[config.tone]}. Глубина: ${DEPTH_LABEL[config.depth]}. Формат: ${FORMAT_LABEL[config.outputFormat]}.`,
    '',
    'Задача: подготовить аналитическую записку по инвестиционному проекту на основании загруженного файла и карточки объекта.',
    notesRule,
    recRule,
    extras.length ? `Дополнительно: ${extras.join('; ')}.` : '',
    '',
    'Обязательные разделы:',
    ...enabled.map((section, index) => `${index + 1}. ${section.title} — ${section.hint}`),
    '',
    `Обязательные метрики: ${config.metrics.join(', ') || 'не заданы'}. Если метрика не считается из файла — укажи «недостаточно данных» и не выдумывай точность.`,
    '',
    config.extraInstructions ? `Особые указания:\n${config.extraInstructions}` : '',
    projectBlock,
  ]
    .filter((line) => line !== '')
    .join('\n')
}
