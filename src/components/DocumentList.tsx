import { documentMarkdownHref, projectDocuments } from '../utils/documents'
import { formatBytes } from '../utils/format'
import type { Project } from '../types'

function docStatus(doc: { status?: string; markdownReady?: boolean; markdownPreview?: string }) {
  if (doc.status === 'converting') return 'Docling…'
  if (doc.status === 'error') return 'ошибка'
  if (doc.markdownReady || doc.markdownPreview) return 'MD готов'
  return 'ждёт Markdown'
}

export function DocumentList({
  project,
  onRemove,
}: {
  project: Project
  onRemove?: (id: string) => void
}) {
  const documents = projectDocuments(project)
  if (!documents.length) return null

  return (
    <ul className="doc-list">
      {documents.map((doc) => (
        <li key={doc.id} className={`doc-list__item ${doc.status === 'error' ? 'is-error' : ''}`}>
          <div>
            <strong>{doc.fileName}</strong>
            <span>
              {formatBytes(doc.fileSize)} · {docStatus(doc)}
              {doc.markdownChars ? ` · ${doc.markdownChars.toLocaleString('ru-RU')} симв.` : ''}
            </span>
            {doc.error && <em>{doc.error}</em>}
          </div>
          <div className="doc-list__actions">
            {(doc.markdownReady || doc.markdownPreview) && (
              <a href={documentMarkdownHref(project.id, doc)} download={`${doc.fileName}.md`}>
                скачать .md
              </a>
            )}
            {onRemove && (
              <button type="button" className="btn btn--ghost" onClick={() => onRemove(doc.id)}>
                убрать
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}
