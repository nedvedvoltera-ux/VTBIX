import { describe, expect, it } from 'vitest'

import {
  decodeOriginalName,
  hydrateProjectDocuments,
  patchDocument,
  summarizeDocuments,
} from '../../server/documents.js'

describe('decodeOriginalName', () => {
  it('пустое имя заменяется заглушкой', () => {
    expect(decodeOriginalName('')).toBe('document')
    expect(decodeOriginalName(null)).toBe('document')
  })

  it('восстанавливает кириллицу из latin1', () => {
    const broken = Buffer.from('Проект КС.pdf', 'utf8').toString('latin1')
    expect(decodeOriginalName(broken)).toBe('Проект КС.pdf')
  })

  it('латинское имя не портит', () => {
    expect(decodeOriginalName('teo-report.pdf')).toBe('teo-report.pdf')
  })
})

describe('summarizeDocuments', () => {
  it('пустой список', () => {
    expect(summarizeDocuments([])).toEqual({
      fileName: null,
      fileSize: null,
      markdownReady: false,
      markdownChars: undefined,
      markdownPreview: undefined,
    })
  })

  it('не массив на входе', () => {
    expect(summarizeDocuments(null).fileName).toBeNull()
    expect(summarizeDocuments('строка').fileName).toBeNull()
  })

  it('один документ показывает своё имя', () => {
    const summary = summarizeDocuments([{ fileName: 'teo.pdf', fileSize: 1000 }])
    expect(summary.fileName).toBe('teo.pdf')
    expect(summary.fileSize).toBe(1000)
  })

  it('несколько документов сворачиваются в «первый +N»', () => {
    const summary = summarizeDocuments([
      { fileName: 'teo.pdf', fileSize: 100 },
      { fileName: 'fin.xlsx', fileSize: 200 },
      { fileName: 'ks.docx', fileSize: 300 },
    ])
    expect(summary.fileName).toBe('teo.pdf +2')
    expect(summary.fileSize).toBe(600)
  })

  it('markdown готов, если готов хоть один файл', () => {
    const summary = summarizeDocuments([{ fileName: 'a.pdf' }, { fileName: 'b.pdf', markdownReady: true, markdownChars: 500 }])
    expect(summary.markdownReady).toBe(true)
    expect(summary.markdownChars).toBe(500)
  })

  it('превью берётся у первого документа с превью', () => {
    const summary = summarizeDocuments([
      { fileName: 'a.pdf', markdownPreview: 'превью А' },
      { fileName: 'b.pdf', markdownReady: true, markdownPreview: 'превью Б' },
    ])
    expect(summary.markdownPreview).toBe('превью А')
  })

  it('готовый документ без превью не прячет превью следующего', () => {
    const summary = summarizeDocuments([
      { fileName: 'a.pdf', markdownReady: true },
      { fileName: 'b.pdf', markdownPreview: 'превью Б' },
    ])
    expect(summary.markdownPreview).toBe('превью Б')
  })

  it('нулевые размеры превращаются в null и undefined', () => {
    const summary = summarizeDocuments([{ fileName: 'a.pdf', fileSize: 0, markdownChars: 0 }])
    expect(summary.fileSize).toBeNull()
    expect(summary.markdownChars).toBeUndefined()
  })
})

describe('hydrateProjectDocuments', () => {
  it('пустой проект проходит насквозь', () => {
    expect(hydrateProjectDocuments(null)).toBeNull()
  })

  it('готовый список документов сохраняется и пересчитывается', () => {
    const project = { id: 'p1', documents: [{ id: 'd1', fileName: 'teo.pdf', fileSize: 10, markdownReady: true }] }
    const next = hydrateProjectDocuments(project)
    expect(next.documents).toHaveLength(1)
    expect(next.fileName).toBe('teo.pdf')
    expect(next.markdownReady).toBe(true)
  })

  it('проект без файла получает пустой список', () => {
    expect(hydrateProjectDocuments({ id: 'p1' }).documents).toEqual([])
  })

  it('старый проект с одним файлом превращается в документ', () => {
    const next = hydrateProjectDocuments({ id: 'p1', fileName: 'teo.pdf', fileSize: 50, markdownPreview: 'превью' })
    expect(next.documents).toHaveLength(1)
    expect(next.documents[0].id).toBe('p1-doc1')
    expect(next.documents[0].markdownReady).toBe(true)
    expect(next.documents[0].status).toBe('ready')
  })

  it('падение на конвертации без превью помечает документ ошибкой', () => {
    const next = hydrateProjectDocuments({ id: 'p1', fileName: 'teo.pdf', pipelineFailedAt: 'converting' })
    expect(next.documents[0].status).toBe('error')
  })

  it('падение на модели оставляет документ готовым', () => {
    const next = hydrateProjectDocuments({ id: 'p1', fileName: 'teo.pdf', pipelineFailedAt: 'extracting', markdownPreview: 'превью' })
    expect(next.documents[0].status).toBe('ready')
  })
})

describe('patchDocument', () => {
  it('добавляет новый документ', () => {
    const list = patchDocument([], { id: 'd1', fileName: 'teo.pdf' })
    expect(list).toHaveLength(1)
  })

  it('обновляет существующий по id, не теряя полей', () => {
    const list = patchDocument([{ id: 'd1', fileName: 'teo.pdf', fileSize: 10 }], { id: 'd1', markdownReady: true })
    expect(list).toHaveLength(1)
    expect(list[0]).toEqual({ id: 'd1', fileName: 'teo.pdf', fileSize: 10, markdownReady: true })
  })

  it('не мутирует исходный массив', () => {
    const source = [{ id: 'd1', fileName: 'teo.pdf' }]
    patchDocument(source, { id: 'd2', fileName: 'fin.pdf' })
    expect(source).toHaveLength(1)
  })

  it('не массив на входе даёт список из одного документа', () => {
    expect(patchDocument(null, { id: 'd1' })).toEqual([{ id: 'd1' }])
  })
})
