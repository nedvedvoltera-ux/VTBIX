import fs from 'node:fs'
import { config } from './config.js'
import { convertToMarkdown } from './docling.js'
import { applyExtraction, buildExtractionPrompts } from './extractPrompt.js'
import { extractFromUpload } from './llm.js'
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
  return `${markdown.slice(0, config.llmMaxDocChars)}\n\n[... документ обрезан для модели, ${markdown.length} символов ...]`
}

export async function runDocumentPipeline({ project, filePath, fileName, notes, prompt, signal, onProgress }) {
  runningPipelines.add(project.id)
  abortByProject.get(project.id)?.abort()
  const localAbort = new AbortController()
  abortByProject.set(project.id, localAbort)
  const combined = anySignal([signal, localAbort.signal])

  try {
    await onProgress({
      stage: 'converting',
      progress: 8,
      message: 'Docling переводит документ в Markdown…',
    })

    let markdown
    try {
      markdown = await convertToMarkdown({ filePath, fileName })
    } catch (error) {
      if (config.doclingUrl || /\.(csv|md|txt)$/i.test(fileName)) throw error
      markdown = [`# ${fileName}`, '', 'Docling не настроен. Ниже — имя файла и пояснения.', notes || ''].join('\n')
      await onProgress({
        stage: 'converting',
        progress: 20,
        message: 'Docling недоступен, Markdown собран из карточки. Задайте DOCLING_URL.',
      })
    }

    const mdPath = `${filePath}.md`
    fs.writeFileSync(mdPath, markdown, 'utf8')
    await onProgress({
      stage: 'extracting',
      progress: 36,
      message: config.llmApiUrl
        ? 'Qwen читает Markdown и извлекает параметры…'
        : 'Модель не задана, поля заполняются эвристикой.',
      markdownPath: mdPath,
      markdownPreview: markdown.slice(0, 6000),
    })

    if (config.llmApiUrl) {
      const { systemPrompt, userPrompt } = buildExtractionPrompts({
        prompt,
        notes,
        markdown: clipMarkdown(markdown),
        fileName,
      })
      const result = await extractWithQwen({
        systemPrompt,
        userPrompt,
        signal: combined,
        onPartial: async (extracted) => {
          await onProgress({
            stage: 'extracting',
            progress: Math.min(92, 40 + Math.round(Object.keys(extracted).length * 6)),
            message: 'Qwen находит параметры в документе…',
            extracted,
            markdownPath: mdPath,
            markdownPreview: markdown.slice(0, 6000),
          })
        },
      })
      await onProgress({
        stage: 'done',
        progress: 100,
        message: 'Параметры извлечены. Проверьте карточку.',
        extracted: result.extracted,
        markdownPath: mdPath,
        markdownPreview: markdown.slice(0, 6000),
        raw: result.raw,
      })
      return { markdown, extracted: result.extracted, mdPath }
    }

    const extracted = extractFromUpload(fileName, `${notes || ''}\n${markdown.slice(0, 2000)}`)
    await onProgress({
      stage: 'done',
      progress: 100,
      message: 'Эвристический разбор (SUMMARY_API_BASE_URL не задан).',
      extracted,
      markdownPath: mdPath,
      markdownPreview: markdown.slice(0, 6000),
    })
    return { markdown, extracted, mdPath }
  } finally {
    if (abortByProject.get(project.id) === localAbort) abortByProject.delete(project.id)
    runningPipelines.delete(project.id)
  }
}

export function mergeProjectProgress(project, payload) {
  const next = applyExtraction(project, payload.extracted)
  return {
    ...next,
    status: payload.stage === 'done' ? 'ready' : payload.stage === 'error' ? 'error' : 'processing',
    progress: payload.progress ?? next.progress,
    pipelineStage: payload.stage,
    pipelineMessage: payload.message,
    markdownPreview: payload.markdownPreview ?? next.markdownPreview,
  }
}

export { applyExtraction }
