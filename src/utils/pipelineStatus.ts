import type { Project } from '../types'

export function markdownWasBuilt(project: Project) {
  const docs = Array.isArray(project.documents) ? project.documents : []
  if (docs.some((item) => item.markdownReady || item.markdownPreview)) return true
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
  const docs = Array.isArray(project.documents) ? project.documents : []
  const ready = docs.filter((item) => item.markdownReady || item.markdownPreview)
  if (ready.length > 1) {
    const size = ready.reduce((sum, item) => sum + (item.markdownChars || 0), 0)
    return `Markdown: ${ready.length} файла${size ? ` · ${size.toLocaleString('ru-RU')} симв.` : ''}`
  }
  if (markdownWasBuilt(project)) {
    const size = project.markdownChars ? `${project.markdownChars.toLocaleString('ru-RU')} симв.` : 'есть превью'
    return `Markdown: да (${size})`
  }
  return 'Markdown: нет — разбор остановился до модели'
}
