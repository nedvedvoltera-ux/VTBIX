import type { Project } from '../types'

export function markdownWasBuilt(project: Project) {
  return Boolean(project.markdownReady || project.markdownPreview || (project.markdownChars ?? 0) > 0)
}

export function pipelineErrorTitle(project: Project) {
  if (project.pipelineFailedAt === 'extracting' || markdownWasBuilt(project)) {
    return 'Ошибка на этапе Qwen — Markdown уже создан'
  }
  if (project.pipelineFailedAt === 'converting') {
    return 'Ошибка на этапе Docling — Markdown не создан'
  }
  return 'Расчёт остановился'
}

export function markdownSummary(project: Project) {
  if (markdownWasBuilt(project)) {
    const size = project.markdownChars ? `${project.markdownChars.toLocaleString('ru-RU')} симв.` : 'есть превью'
    return `Markdown: да (${size})`
  }
  return 'Markdown: нет — разбор остановился до модели'
}
