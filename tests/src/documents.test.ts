import { describe, expect, it } from 'vitest'

import { documentMarkdownHref, hasReadyMarkdown, projectDocuments } from '../../src/utils/documents'
import type { Project } from '../../src/types'

function project(extra: Partial<Project> = {}): Project {
  return { id: 'p1', name: 'Мост', status: 'draft', ...extra } as Project
}

describe('projectDocuments', () => {
  it('пустой проект даёт пустой список', () => {
    expect(projectDocuments(null)).toEqual([])
    expect(projectDocuments(undefined)).toEqual([])
  })

  it('проект без файла даёт пустой список', () => {
    expect(projectDocuments(project())).toEqual([])
  })

  it('готовый список документов отдаётся как есть', () => {
    const documents = [{ id: 'd1', fileName: 'teo.pdf', fileSize: 10, markdownReady: true, status: 'ready' as const }]
    expect(projectDocuments(project({ documents }))).toBe(documents)
  })

  it('старый проект с одним файлом превращается в документ', () => {
    const docs = projectDocuments(project({ fileName: 'teo.pdf', fileSize: 2048, markdownReady: true, markdownChars: 900 }))
    expect(docs).toHaveLength(1)
    expect(docs[0].id).toBe('p1-doc1')
    expect(docs[0].fileName).toBe('teo.pdf')
    expect(docs[0].fileSize).toBe(2048)
    expect(docs[0].markdownChars).toBe(900)
    expect(docs[0].status).toBe('ready')
  })

  it('файл без markdown помечается ошибкой', () => {
    expect(projectDocuments(project({ fileName: 'teo.pdf' }))[0].status).toBe('error')
  })

  it('только превью тоже считается готовым', () => {
    const docs = projectDocuments(project({ fileName: 'teo.pdf', markdownPreview: 'превью' }))
    expect(docs[0].markdownReady).toBe(true)
    expect(docs[0].status).toBe('ready')
  })

  it('размер по умолчанию ноль', () => {
    expect(projectDocuments(project({ fileName: 'teo.pdf' }))[0].fileSize).toBe(0)
  })

  it('пустой массив документов не мешает старому файлу', () => {
    const docs = projectDocuments(project({ documents: [], fileName: 'teo.pdf' }))
    expect(docs).toHaveLength(1)
  })
})

describe('documentMarkdownHref', () => {
  it('строит ссылку на markdown документа', () => {
    const href = documentMarkdownHref('p1', { id: 'd1', fileName: 'teo.pdf', fileSize: 0, status: 'ready' })
    expect(href).toBe('/api/projects/p1/documents/d1/markdown')
  })
})

describe('hasReadyMarkdown', () => {
  it('нет файлов — нет markdown', () => {
    expect(hasReadyMarkdown(project())).toBe(false)
  })

  it('файл без разбора — нет markdown', () => {
    expect(hasReadyMarkdown(project({ fileName: 'teo.pdf' }))).toBe(false)
  })

  it('готовый документ даёт true', () => {
    expect(hasReadyMarkdown(project({ fileName: 'teo.pdf', markdownReady: true }))).toBe(true)
  })

  it('хотя бы один готовый документ из списка', () => {
    const documents = [
      { id: 'd1', fileName: 'a.pdf', fileSize: 0, status: 'error' as const },
      { id: 'd2', fileName: 'b.pdf', fileSize: 0, markdownReady: true, status: 'ready' as const },
    ]
    expect(hasReadyMarkdown(project({ documents }))).toBe(true)
  })

  it('все документы без markdown — false', () => {
    const documents = [{ id: 'd1', fileName: 'a.pdf', fileSize: 0, status: 'error' as const }]
    expect(hasReadyMarkdown(project({ documents }))).toBe(false)
  })
})
