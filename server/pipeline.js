import fs from 'node:fs'
import { config } from './config.js'
import { convertToMarkdown } from './docling.js'
import { combineDocumentsMarkdown, patchDocument, readDocumentMarkdown, summarizeDocuments } from './documents.js'
import { applyExtraction, buildExtractionPrompts } from './extractPrompt.js'
import { describeNetworkError, PipelineError } from './httpErrors.js'
import { extractFromUpload } from './llm.js'
import { resolveLlmRuntime } from './llmSettings.js'
import { extractWithQwen } from './qwen.js'

const abortByProject = new Map()
export const runningPipelines = new Set()

function anySignal(signals) {
  const live = signals.filter(Boolean)
  if (typeof AbortSignal.any === 'function') return AbortSignal.any(live)
  const controller = new AbortController()
  for (const signal of live) {
    if (signal.aborted) {
      controller.abort()
      return controller.signal
    }
    signal.addEventListener('abort', () => controller.abort(), { once: true })
  }
  return controller.signal
}

export function abortPipeline(projectId) {
  abortByProject.get(projectId)?.abort()
  abortByProject.delete(projectId)
  runningPipelines.delete(projectId)
}

function clipMarkdown(markdown) {
  if (markdown.length <= config.llmMaxDocChars) return markdown
  return `${markdown.slice(0, config.llmMaxDocChars)}\n\n[... документы обрезаны для модели, ${markdown.length} символов ...]`
}

function beginRun(projectId) {
  runningPipelines.add(projectId)
  abortByProject.get(projectId)?.abort()
  const localAbort = new AbortController()
  abortByProject.set(projectId, localAbort)
  return localAbort
}

function endRun(projectId, localAbort) {
  if (abortByProject.get(projectId) === localAbort) abortByProject.delete(projectId)
  runningPipelines.delete(projectId)
}

async function convertOneFile({ filePath, fileName, onProgress }) {
  let markdown
  try {
    markdown = await convertToMarkdown({ filePath, fileName, onProgress })
  } catch (error) {
    if (!config.doclingUrl && !/\.(csv|md|txt)$/i.test(fileName)) {
      markdown = [`# ${fileName}`, '', 'Docling не настроен. Задайте DOCLING_URL.'].join('\n')
    } else {
      const detail = describeNetworkError(error, { service: 'Docling', url: config.doclingUrl })
      throw new PipelineError('converting', `Этап 1/2 Docling — Markdown не создан (${fileName}). ${detail}`)
    }
  }
  const mdPath = `${filePath}.md`
  fs.writeFileSync(mdPath, markdown, 'utf8')
  console.log(`[pipeline] markdown ready (${markdown.length} chars) ${mdPath}`)
  return { markdown, mdPath }
}

async function convertDocument({ doc, onProgress, index, total }) {
  await onProgress({
    stage: 'converting',
    progress: Math.min(48, 8 + Math.round(((index + 0.15) / total) * 40)),
    message: `Docling: ${doc.fileName} (${index + 1}/${total})`,
    document: { ...doc, status: 'converting' },
  })
  try {
    const { markdown, mdPath } = await convertOneFile({
      filePath: doc.filePath,
      fileName: doc.fileName,
      onProgress,
    })
    const updated = {
      ...doc,
      status: 'ready',
      markdownPath: mdPath,
      markdownPreview: markdown.slice(0, 4000),
      markdownChars: markdown.length,
      markdownReady: true,
      error: undefined,
    }
    await onProgress({
      stage: 'converting',
      progress: Math.min(55, 8 + Math.round(((index + 1) / total) * 48)),
      message: `Markdown готов: ${doc.fileName} (${markdown.length} симв.)`,
      document: updated,
    })
    return updated
  } catch (error) {
    error.documentId = error.documentId || doc.id
    throw error
  }
}

export async function runConvertDocuments({ project, documents, onProgress }) {
  const localAbort = beginRun(project.id)
  const list = documents.filter((item) => item.filePath)
  try {
    for (let index = 0; index < list.length; index += 1) {
      await convertDocument({ doc: list[index], onProgress, index, total: list.length })
    }
    const count = list.length
    await onProgress({
      stage: 'done',
      progress: 100,
      extract: false,
      message:
        count > 1
          ? `Markdown готов: ${count} файла. Нажмите «Пересобрать поля», чтобы отправить все в Qwen.`
          : 'Markdown готов. Нажмите «Пересобрать поля», чтобы отправить документ в Qwen.',
    })
  } finally {
    endRun(project.id, localAbort)
  }
}

export async function runExtractDocuments({ project, notes, prompt, signal, onProgress }) {
  const localAbort = beginRun(project.id)
  const combinedSignal = anySignal([signal, localAbort.signal])
  try {
    let documents = Array.isArray(project.documents) ? [...project.documents] : []
    const pending = documents.filter((item) => !item.markdownReady && item.filePath)
    for (let index = 0; index < pending.length; index += 1) {
      const updated = await convertDocument({
        doc: pending[index],
        onProgress,
        index,
        total: pending.length,
      })
      documents = patchDocument(documents, updated)
    }

    const ready = documents.filter((item) => item.markdownReady || readDocumentMarkdown(item).trim())
    if (!ready.length) {
      throw new PipelineError('converting', 'Этап 1/2 Docling — нет готового Markdown. Сначала загрузите файлы.')
    }

    const markdown = combineDocumentsMarkdown(ready)
    const fileName = ready.map((item) => item.fileName).join(', ')
    await onProgress({
      stage: 'extracting',
      progress: 58,
      message: config.llmApiUrl
        ? `В Qwen уходят ${ready.length} Markdown (${markdown.length} симв.)…`
        : `Markdown готов (${ready.length}). Модель не задана, дальше эвристика.`,
      markdownPreview: markdown.slice(0, 6000),
      markdownChars: markdown.length,
      markdownReady: true,
    })

    const runtime = resolveLlmRuntime()
    if (runtime.configured) {
      const { systemPrompt, userPrompt } = buildExtractionPrompts({
        prompt,
        notes,
        markdown: clipMarkdown(markdown),
        fileName,
      })
      try {
        const result = await extractWithQwen({
          systemPrompt,
          userPrompt,
          signal: combinedSignal,
          onPartial: async (extracted) => {
            await onProgress({
              stage: 'extracting',
              progress: Math.min(92, 60 + Math.round(Object.keys(extracted).length * 5)),
              message: `${runtime.label} читает ${ready.length} документ(а)…`,
              extracted,
              markdownPreview: markdown.slice(0, 6000),
              markdownChars: markdown.length,
              markdownReady: true,
            })
          },
        })
        await onProgress({
          stage: 'done',
          progress: 100,
          extract: true,
          message: `Параметры извлечены из ${ready.length} документ(ов). Проверьте карточку.`,
          extracted: result.extracted,
          markdownPreview: markdown.slice(0, 6000),
          markdownChars: markdown.length,
          markdownReady: true,
          raw: result.raw,
        })
        return { markdown, extracted: result.extracted }
      } catch (error) {
        const endpoint =
          runtime.protocol === 'anthropic' ? `${runtime.apiUrl}/messages` : `${runtime.apiUrl}/chat/completions`
        const detail = describeNetworkError(error, {
          service: runtime.service,
          url: endpoint,
        })
        console.error(`[pipeline ${project.id}] FAIL extracting (markdown already saved)`, detail)
        throw new PipelineError(
          'extracting',
          `Этап 2/2 ${runtime.label} — Markdown уже сохранён (${ready.length} файл., ${markdown.length} симв.), ошибка на модели. ${detail}`,
          {
            markdownPreview: markdown.slice(0, 6000),
            markdownChars: markdown.length,
          },
        )
      }
    }

    const extracted = extractFromUpload(fileName, `${notes || ''}\n${markdown.slice(0, 2000)}`)
    await onProgress({
      stage: 'done',
      progress: 100,
      extract: true,
      message: runtime.source === 'cloud'
        ? 'Эвристический разбор (облачная LLM не настроена: нужен API-ключ в Настройках).'
        : 'Эвристический разбор (локальная LLM не задана).',
      extracted,
      markdownPreview: markdown.slice(0, 6000),
      markdownChars: markdown.length,
      markdownReady: true,
    })
    return { markdown, extracted }
  } finally {
    endRun(project.id, localAbort)
  }
}

export function mergeProjectProgress(project, payload, prompt) {
  const extracted = payload.extract === false ? null : payload.extracted
  const next = extracted ? applyExtraction(project, extracted, prompt) : { ...project }
  const documents = payload.document ? patchDocument(next.documents, payload.document) : next.documents || []
  const summary = summarizeDocuments(documents)
  const convertOnlyDone = payload.stage === 'done' && payload.extract === false
  return {
    ...next,
    documents,
    ...summary,
    markdownPreview: payload.markdownPreview ?? summary.markdownPreview ?? next.markdownPreview,
    markdownReady: payload.markdownReady ?? summary.markdownReady ?? next.markdownReady,
    markdownChars: payload.markdownChars ?? summary.markdownChars ?? next.markdownChars,
    status:
      payload.stage === 'error'
        ? 'error'
        : payload.stage === 'done' && extracted
          ? 'ready'
          : convertOnlyDone
            ? next.extractedByLlm
              ? 'ready'
              : 'draft'
            : 'processing',
    progress: payload.progress ?? next.progress,
    pipelineStage: convertOnlyDone ? undefined : payload.stage,
    pipelineMessage: payload.message,
  }
}

export { applyExtraction }
