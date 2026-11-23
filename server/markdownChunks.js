/**
 * Режет Markdown на перекрывающиеся чанки для map-reduce.
 * Длинные таблицы не теряют шапку: при разрезе посередине в следующий чанк
 * снова подставляются заголовки колонок.
 */

function isTableLine(line) {
  const trimmed = String(line || '').trim()
  if (!trimmed.startsWith('|')) return false
  return trimmed.indexOf('|', 1) >= 0
}

function isSeparatorLine(line) {
  const trimmed = String(line || '').trim()
  if (!trimmed.includes('-')) return false
  return /^\|?[\s:|.-]+$/.test(trimmed) && /-{3,}/.test(trimmed)
}

function looksLikeDataRow(line) {
  const cells = String(line || '')
    .split('|')
    .map((cell) => cell.trim())
    .filter(Boolean)
  if (cells.length < 2) return false
  let numeric = 0
  for (const cell of cells) {
    if (/\d/.test(cell) && !/^-+$/.test(cell)) numeric += 1
  }
  return numeric >= Math.ceil(cells.length / 3)
}

function splitLines(text) {
  const lines = []
  let offset = 0
  const parts = text.split('\n')
  for (let i = 0; i < parts.length; i += 1) {
    const line = parts[i]
    const start = offset
    const end = offset + line.length
    lines.push({ index: i, start, end, text: line })
    offset = end + (i < parts.length - 1 ? 1 : 0)
  }
  return lines
}

function lineIndexAt(lines, pos) {
  if (!lines.length) return -1
  if (pos <= 0) return 0
  for (let i = 0; i < lines.length; i += 1) {
    if (pos <= lines[i].end) return i
    if (pos < lines[i].end + 1) return i
  }
  return lines.length - 1
}

function tableBlockBounds(lines, lineIndex) {
  if (lineIndex < 0 || lineIndex >= lines.length || !isTableLine(lines[lineIndex].text)) return null
  let start = lineIndex
  while (start > 0 && isTableLine(lines[start - 1].text)) start -= 1
  let end = lineIndex
  while (end + 1 < lines.length && isTableLine(lines[end + 1].text)) end += 1
  return { start, end }
}

/** Шапка таблицы: первая строка + separator + возможные подзаголовки до данных. */
export function extractTableHeader(lines, tableStart) {
  if (tableStart < 0 || tableStart >= lines.length || !isTableLine(lines[tableStart].text)) return null
  const header = [lines[tableStart].text]
  let i = tableStart + 1
  if (i < lines.length && isSeparatorLine(lines[i].text)) {
    header.push(lines[i].text)
    i += 1
  }
  while (i < lines.length && isTableLine(lines[i].text) && header.length < 4) {
    if (isSeparatorLine(lines[i].text)) {
      header.push(lines[i].text)
      i += 1
      continue
    }
    if (looksLikeDataRow(lines[i].text)) break
    header.push(lines[i].text)
    i += 1
  }
  return {
    text: header.join('\n'),
    startLine: tableStart,
    endLine: i - 1,
    endOffset: lines[i - 1].end,
  }
}

function snapEndToLine(lines, text, start, desiredEnd) {
  if (desiredEnd >= text.length) return text.length
  const idx = lineIndexAt(lines, Math.max(start, desiredEnd - 1))
  if (idx < 0) return desiredEnd
  // заканчиваем после перевода строки этой строки, если он есть
  const line = lines[idx]
  if (line.end + 1 <= text.length && text[line.end] === '\n') return line.end + 1
  return line.end
}

function preferBreakOutsideTable(lines, text, start, end, size) {
  if (end >= text.length) return end
  const endLine = lineIndexAt(lines, Math.max(start, end - 1))
  const block = tableBlockBounds(lines, endLine)
  if (!block) return end

  const header = extractTableHeader(lines, block.start)
  const headerEnd = header?.endOffset ?? lines[block.start].end
  const tableStartOffset = lines[block.start].start
  const minKeep = start + Math.floor(size * 0.45)

  // Если режем внутри шапки — либо дотянуть до конца шапки, либо оставить таблицу следующему чанку.
  if (end <= headerEnd + 1) {
    if (headerEnd + 1 - start <= size && headerEnd + 1 > start) return Math.min(text.length, headerEnd + 1)
    if (tableStartOffset > minKeep) return tableStartOffset
    return end
  }

  // Если таблица только началась в конце чанка и почти не влезла — лучше отдать её целиком дальше.
  if (tableStartOffset > minKeep && end - tableStartOffset < Math.floor(size * 0.2)) {
    return tableStartOffset
  }

  return end
}

function continuationHeader(lines, start) {
  const idx = lineIndexAt(lines, start)
  if (idx < 0) return ''
  // старт на пустой строке перед таблицей — не continuation
  if (!isTableLine(lines[idx].text)) {
    if (start > lines[idx].start) return ''
    return ''
  }
  const block = tableBlockBounds(lines, idx)
  if (!block) return ''
  const header = extractTableHeader(lines, block.start)
  if (!header) return ''
  // Мы в начале этой таблицы (включая шапку) — повторять не нужно.
  if (start <= header.endOffset + 1 && idx <= header.endLine) return ''
  return [
    '[продолжение таблицы — снова заголовки колонок, затем строки этого фрагмента]',
    header.text,
    '',
  ].join('\n')
}

/**
 * @param {string} markdown
 * @param {{ chunkChars?: number, overlap?: number }} [options]
 */
export function chunkMarkdown(markdown, { chunkChars = 70_000, overlap = 3_000 } = {}) {
  const text = String(markdown || '')
  if (!text) return []

  const rawSize = Number(chunkChars)
  const size = Number.isFinite(rawSize) && rawSize > 0 ? Math.max(256, Math.floor(rawSize)) : 70_000
  const rawOverlap = Number(overlap)
  const overlapChars = Number.isFinite(rawOverlap) && rawOverlap > 0 ? Math.min(size - 1, Math.floor(rawOverlap)) : 0

  if (text.length <= size) {
    return [{ index: 0, total: 1, text, start: 0, end: text.length }]
  }

  const lines = splitLines(text)
  const step = Math.max(1, size - overlapChars)
  const chunks = []
  let start = 0

  while (start < text.length) {
    let end = Math.min(text.length, start + size)
    end = snapEndToLine(lines, text, start, end)
    end = preferBreakOutsideTable(lines, text, start, end, size)
    if (end <= start) {
      end = Math.min(text.length, start + size)
      end = snapEndToLine(lines, text, start, end)
      if (end <= start) end = Math.min(text.length, start + size)
    }

    const prefix = continuationHeader(lines, start)
    const body = text.slice(start, end)
    chunks.push({
      index: chunks.length,
      text: prefix ? `${prefix}${body}` : body,
      start,
      end,
      tableHeaderRepeated: Boolean(prefix),
    })

    if (end >= text.length) break

    let next = start + step
    if (next >= end) next = end
    // Не начинать следующий чанк посередине строки.
    next = snapEndToLine(lines, text, next, next)
    if (next <= start) next = end
    // Если overlap вернул нас в шапку той же таблицы — лучше стартовать со строк данных после шапки,
    // шапка всё равно подставится через continuationHeader.
    const nextLine = lineIndexAt(lines, next)
    const block = tableBlockBounds(lines, nextLine)
    if (block) {
      const header = extractTableHeader(lines, block.start)
      if (header && next > lines[block.start].start && next <= header.endOffset + 1) {
        const afterHeader = header.endOffset + 1
        if (afterHeader < end && afterHeader > start) next = afterHeader
      }
    }
    start = next
  }

  return chunks.map((chunk, index, list) => ({
    ...chunk,
    index,
    total: list.length,
  }))
}
