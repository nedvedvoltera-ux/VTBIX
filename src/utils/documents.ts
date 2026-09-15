import type { Project, ProjectDocument } from '../types'

export function projectDocuments(project: Project | null | undefined): ProjectDocument[] {
  if (!project) return []
  if (Array.isArray(project.documents) && project.documents.length) return project.documents
  if (!project.fileName) return []
  return [
    {
      id: `${project.id}-doc1`,
      fileName: project.fileName,
      fileSize: project.fileSize || 0,
      markdownPreview: project.markdownPreview,
      markdownChars: project.markdownChars,
      markdownReady: Boolean(project.markdownReady || project.markdownPreview),
      status: project.markdownReady || project.markdownPreview ? 'ready' : 'error',
    },
  ]
}

export function documentMarkdownHref(projectId: string, doc: ProjectDocument) {
  return `/api/projects/${projectId}/documents/${doc.id}/markdown`
}

export function hasReadyMarkdown(project: Project) {
  return projectDocuments(project).some((item) => item.markdownReady || item.markdownPreview)
}
