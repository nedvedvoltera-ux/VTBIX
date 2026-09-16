import { describe, expect, it } from 'vitest'

import {
  markdownSummary,
  markdownWasBuilt,
  pipelineErrorTitle,
  pipelineFailed,
  pipelineStageTitle,
} from '../../src/utils/pipelineStatus'
import type { Project, ProjectDocument } from '../../src/types'

function project(extra: Partial<Project> = {}): Project {
  return { id: 'p1', name: 'Мост', status: 'error', ...extra } as Project
}

function doc(extra: Partial<ProjectDocument> = {}): ProjectDocument {
  return { id: 'd1', fileName: 'teo.pdf', fileSize: 0, status: 'ready', ...extra } as ProjectDocument
}

describe('markdownWasBuilt', () => {
  it('пустой проект — markdown не создан', () => {
    expect(markdownWasBuilt(project())).toBe(false)
  })

  it('готовый документ в списке', () => {
    expect(markdownWasBuilt(project({ documents: [doc({ markdownReady: true })] }))).toBe(true)
  })

  it('документ только с превью тоже считается', () => {
    expect(markdownWasBuilt(project({ documents: [doc({ markdownPreview: 'превью' })] }))).toBe(true)
  })

  it('поля старого формата тоже учитываются', () => {
    expect(markdownWasBuilt(project({ markdownReady: true }))).toBe(true)
    expect(markdownWasBuilt(project({ markdownPreview: 'превью' }))).toBe(true)
    expect(markdownWasBuilt(project({ markdownChars: 500 }))).toBe(true)
  })

  it('ноль символов не считается', () => {
    expect(markdownWasBuilt(project({ markdownChars: 0 }))).toBe(false)
  })

  it('документы без markdown не считаются', () => {
    expect(markdownWasBuilt(project({ documents: [doc({ status: 'error' })] }))).toBe(false)
  })
})

describe('pipelineErrorTitle', () => {
  it('падение на модели', () => {
    expect(pipelineErrorTitle(project({ pipelineFailedAt: 'extracting' }))).toBe('Ошибка на этапе Qwen — Markdown уже создан')
  })

  it('падение на конвертации без markdown', () => {
    expect(pipelineErrorTitle(project({ pipelineFailedAt: 'converting' }))).toBe('Ошибка на этапе Docling — Markdown не создан')
  })

  it('падение на конвертации второго файла, когда markdown уже есть, относят к модели', () => {
    const next = project({ pipelineFailedAt: 'converting', markdownReady: true })
    expect(pipelineErrorTitle(next)).toBe('Ошибка на этапе Qwen — Markdown уже создан')
  })

  it('неизвестный этап', () => {
    expect(pipelineErrorTitle(project())).toBe('Расчёт остановился')
  })
})

describe('pipelineStageTitle', () => {
  it('этап конвертации', () => {
    expect(pipelineStageTitle(project({ pipelineStage: 'converting' }))).toBe('Docling готовит Markdown')
  })

  it('этап модели', () => {
    expect(pipelineStageTitle(project({ pipelineStage: 'extracting' }))).toBe('Qwen извлекает параметры')
  })

  it('этап ещё не пришёл — нейтральный заголовок вместо «Docling»', () => {
    expect(pipelineStageTitle(project())).toBe('Разбор запущен')
  })
})

describe('pipelineFailed', () => {
  it('статус ошибки', () => {
    expect(pipelineFailed(project({ status: 'error' }))).toBe(true)
  })

  it('известен упавший этап', () => {
    expect(pipelineFailed(project({ status: 'processing', pipelineFailedAt: 'converting' }))).toBe(true)
  })

  it('живой проект без падений', () => {
    expect(pipelineFailed(project({ status: 'draft' }))).toBe(false)
    expect(pipelineFailed(project({ status: 'processing' }))).toBe(false)
  })
})

describe('markdownSummary', () => {
  it('markdown не создан', () => {
    expect(markdownSummary(project())).toBe('Markdown: нет — разбор остановился до модели')
  })

  it('один файл с числом символов', () => {
    const text = markdownSummary(project({ markdownReady: true, markdownChars: 12_345 }))
    expect(text).toContain('Markdown: да')
    expect(text).toContain('симв.')
    expect(text.replace(/\s/g, ' ')).toMatch(/12.345/)
  })

  it('один файл только с превью', () => {
    expect(markdownSummary(project({ markdownPreview: 'превью' }))).toBe('Markdown: да (есть превью)')
  })

  it('несколько готовых файлов считаются вместе', () => {
    const next = project({
      documents: [doc({ id: 'd1', markdownReady: true, markdownChars: 1000 }), doc({ id: 'd2', markdownReady: true, markdownChars: 500 })],
    })
    const text = markdownSummary(next)
    expect(text).toContain('2 файла')
    expect(text.replace(/\s/g, ' ')).toMatch(/1.500/)
  })

  it('несколько файлов без размера показываются без символов', () => {
    const next = project({
      documents: [doc({ id: 'd1', markdownPreview: 'а' }), doc({ id: 'd2', markdownPreview: 'б' })],
    })
    expect(markdownSummary(next)).toBe('Markdown: 2 файла')
  })
})
