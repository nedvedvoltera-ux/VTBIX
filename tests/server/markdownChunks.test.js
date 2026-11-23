import { describe, expect, it } from 'vitest'

import { chunkMarkdown, extractTableHeader } from '../../server/markdownChunks.js'

function longTableMarkdown({ prefix = 200, rows = 120, suffix = 100 } = {}) {
  const head = `${'Вводный текст. '.repeat(Math.ceil(prefix / 15)).slice(0, prefix)}\n\n`
  const header = [
    '| Показатель | Значение | Ед. | Примечание |',
    '|------------|----------|-----|------------|',
  ].join('\n')
  const body = Array.from({ length: rows }, (_, i) => `| CAPEX-${i} | ${1_000_000 + i} | руб. | строка ${i} |`).join('\n')
  const tail = `\n\n${'Конец. '.repeat(Math.ceil(suffix / 7)).slice(0, suffix)}`
  return `${head}${header}\n${body}${tail}`
}

describe('chunkMarkdown', () => {
  it('пустой текст даёт пустой список', () => {
    expect(chunkMarkdown('')).toEqual([])
    expect(chunkMarkdown(null)).toEqual([])
  })

  it('короткий документ — один чанк', () => {
    const chunks = chunkMarkdown('короткий текст', { chunkChars: 1000, overlap: 100 })
    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toMatchObject({ index: 0, total: 1, text: 'короткий текст', start: 0 })
    expect(chunks[0].end).toBe('короткий текст'.length)
  })

  it('длинный документ режется с перекрытием и покрывает весь текст', () => {
    const text = Array.from({ length: 250 }, (_, i) => `строка-${i}\n`).join('')
    const chunks = chunkMarkdown(text, { chunkChars: 500, overlap: 80 })
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks[0].index).toBe(0)
    expect(chunks.at(-1).total).toBe(chunks.length)
    expect(chunks[0].start).toBe(0)
    expect(chunks.at(-1).end).toBe(text.length)

    const covered = new Set()
    for (const chunk of chunks) {
      for (let i = chunk.start; i < chunk.end; i += 1) covered.add(i)
    }
    expect(covered.size).toBe(text.length)
  })

  it('факт только во второй половине попадает во второй чанк', () => {
    const head = `${'A'.repeat(800)}\n`
    const fact = 'ОБЪЕМ ИНВЕСТИЦИЙ 154000000000'
    const text = `${head}${fact}\n${'B'.repeat(800)}`
    const chunks = chunkMarkdown(text, { chunkChars: 700, overlap: 80 })
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks[0].text).not.toContain(fact)
    expect(chunks.some((chunk) => chunk.index > 0 && chunk.text.includes(fact))).toBe(true)
  })

  it('продолжение длинной таблицы снова получает заголовки колонок', () => {
    const text = longTableMarkdown({ prefix: 120, rows: 200, suffix: 80 })
    const chunks = chunkMarkdown(text, { chunkChars: 1800, overlap: 200 })
    expect(chunks.length).toBeGreaterThan(1)

    const continuations = chunks.filter((chunk) => chunk.tableHeaderRepeated)
    expect(continuations.length).toBeGreaterThan(0)
    for (const chunk of continuations) {
      expect(chunk.text).toContain('продолжение таблицы')
      expect(chunk.text).toContain('| Показатель | Значение | Ед. | Примечание |')
      expect(chunk.text).toContain('|------------|----------|-----|------------|')
      expect(chunk.text).toMatch(/\| CAPEX-\d+ \|/)
    }

    const covered = new Set()
    for (const chunk of chunks) {
      for (let i = chunk.start; i < chunk.end; i += 1) covered.add(i)
    }
    expect(covered.size).toBe(text.length)
  })

  it('двухстрочная шапка с подзаголовками X/Y сохраняется при продолжении', () => {
    const header = [
      '| № | Наименование | Начало | Начало | Конец | Конец |',
      '|---|--------------|--------|--------|-------|-------|',
      '|   |              | X      | Y      | X     | Y     |',
    ].join('\n')
    const rows = Array.from({ length: 80 }, (_, i) => `| ${i + 1} | участок ${i} | ${1000 + i} | ${2000 + i} | ${3000 + i} | ${4000 + i} |`).join(
      '\n',
    )
    const text = `${'A'.repeat(400)}\n${header}\n${rows}\n${'B'.repeat(200)}`
    const chunks = chunkMarkdown(text, { chunkChars: 900, overlap: 120 })
    const continuations = chunks.filter((chunk) => chunk.tableHeaderRepeated)
    expect(continuations.length).toBeGreaterThan(0)
    expect(continuations[0].text).toContain('| № | Наименование | Начало | Начало | Конец | Конец |')
    expect(continuations[0].text).toContain('|   |              | X      | Y      | X     | Y     |')
  })
})

describe('extractTableHeader', () => {
  it('берёт строку заголовка, separator и подзаголовок', () => {
    const lines = [
      { text: '| A | B |' },
      { text: '|---|---|' },
      { text: '| x | y |' },
      { text: '| 1 | 2 |' },
    ].map((line, index) => ({ ...line, index, start: index * 10, end: index * 10 + line.text.length }))
    const header = extractTableHeader(lines, 0)
    expect(header.text.split('\n')).toEqual(['| A | B |', '|---|---|', '| x | y |'])
  })
})
