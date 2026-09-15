import fs from 'node:fs'

export function decodeOriginalName(name) {
  if (!name) return 'document'
  const utf8 = Buffer.from(name, 'latin1').toString('utf8')
  return /[А-Яа-яЁё]/.test(utf8) ? utf8 : name
}

export function summarizeDocuments(documents = []) {
  const list = Array.isArray(documents) ? documents : []
  const names = list.map((item) => item.fileName).filter(Boolean)
  const ready = list.filter((item) => item.markdownReady || item.markdownPreview)
  return {
    fileName: names.length === 0 ? null : names.length === 1 ? names[0] : `${names[0]} +${names.length - 1}`,
    fileSize: list.reduce((sum, item) => sum + (Number(item.fileSize) || 0), 0) || null,
    markdownReady: ready.length > 0,
    markdownChars: list.reduce((sum, item) => sum + (Number(item.markdownChars) || 0), 0) || undefined,
    markdownPreview: ready[0]?.markdownPreview || list.find((item) => item.markdownPreview)?.markdownPreview,
  }
}

export function hydrateProjectDocuments(project) {
  if (!project) return project
  if (Array.isArray(project.documents) && project.documents.length) {
    return { ...project, documents: project.documents, ...summarizeDocuments(project.documents) }
  }
  if (!project.fileName) return { ...project, documents: [] }
  const documents = [
    {
      id: `${project.id}-doc1`,
      fileName: project.fileName,
      fileSize: project.fileSize || 0,
      markdownPreview: project.markdownPreview,
      markdownChars: project.markdownChars,
      markdownReady: Boolean(project.markdownReady || project.markdownPreview),
      status: project.pipelineFailedAt === 'converting' && !project.markdownPreview ? 'error' : 'ready',
    },
  ]
  return { ...project, documents, ...summarizeDocuments(documents) }
}

export function patchDocument(documents = [], nextDoc) {
  const list = Array.isArray(documents) ? [...documents] : []
  const index = list.findIndex((item) => item.id === nextDoc.id)
  if (index >= 0) list[index] = { ...list[index], ...nextDoc }
  else list.push(nextDoc)
  return list
}

export function readDocumentMarkdown(doc) {
  if (doc?.markdownPath && fs.existsSync(doc.markdownPath)) {
    return fs.readFileSync(doc.markdownPath, 'utf8')
  }
  return String(doc?.markdownPreview || '')
}

export function combineDocumentsMarkdown(documents = []) {
  return documents
    .filter((item) => item.markdownReady || item.markdownPath || item.markdownPreview)
    .map((item, index) => {
      const body = readDocumentMarkdown(item).trim() || '_(пустой Markdown)_'
      return `# Документ ${index + 1}: ${item.fileName}\n\n${body}`
    })
    .join('\n\n\n---\n\n')
}
