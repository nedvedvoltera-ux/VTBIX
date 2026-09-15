import fs from 'node:fs'
import { config } from './config.js'
import { convertToMarkdown } from './docling.js'
import { applyExtraction, buildExtractionPrompts } from './extractPrompt.js'
import { describeNetworkError, PipelineError } from './httpErrors.js'
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
      markdown = await convertToMarkdown({
        filePath,
        fileName,
        onProgress,
      })
    } catch (error) {
      if (!config.doclingUrl && !/\.(csv|md|txt)$/i.test(fileName)) {
        markdown = [`# ${fileName}`, '', 'Docling не настроен. Ниже — имя файла и пояснения.', notes || ''].join('\n')
        await onProgress({
          stage: 'converting',
          progress: 20,
          message: 'Docling недоступен, Markdown собран из карточки. Задайте DOCLING_URL.',
        })
      } else {
        const detail = describeNetworkError(error, { service: 'Docling', url: config.doclingUrl })
        console.error(`[pipeline ${project.id}] FAIL converting (markdown not created)`, detail)
        throw new PipelineError('converting', `Этап 1/2 Docling — Markdown не создан. ${detail}`)
      }
    }

    const mdPath = `${filePath}.md`
    fs.writeFileSync(mdPath, markdown, 'utf8')
    console.log(`[pipeline ${project.id}] markdown ready (${markdown.length} chars) ${mdPath}`)
    await onProgress({
      stage: 'extracting',
      progress: 36,
      message: config.llmApiUrl
        ? `Markdown готов (${markdown.length} симв.). Отправляю в Qwen…`
        : `Markdown готов (${markdown.length} симв.). Модель не задана, дальше эвристика.`,
      markdownPath: mdPath,
      markdownPreview: markdown.slice(0, 6000),
      markdownChars: markdown.length,
      markdownReady: true,
    })

    if (config.llmApiUrl) {
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
          signal: combined,
          onPartial: async (extracted) => {
            await onProgress({
              stage: 'extracting',
              progress: Math.min(92, 40 + Math.round(Object.keys(extracted).length * 6)),
              message: 'Qwen находит параметры в документе…',
              extracted,
              markdownPath: mdPath,
              markdownPreview: markdown.slice(0, 6000),
              markdownChars: markdown.length,
              markdownReady: true,
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
          markdownChars: markdown.length,
          markdownReady: true,
          raw: result.raw,
        })
        return { markdown, extracted: result.extracted, mdPath }
      } catch (error) {
        const detail = describeNetworkError(error, {
          service: 'Qwen',
          url: `${config.llmApiUrl}/chat/completions`,
        })
        console.error(`[pipeline ${project.id}] FAIL extracting (markdown already saved)`, detail)
        throw new PipelineError(
          'extracting',
          `Этап 2/2 Qwen — Markdown уже сохранён (${markdown.length} симв.), ошибка на модели. ${detail}`,
          {
            markdownPreview: markdown.slice(0, 6000),
            markdownPath: mdPath,
            markdownChars: markdown.length,
          },
        )
      }
    }

    const extracted = extractFromUpload(fileName, `${notes || ''}\n${markdown.slice(0, 2000)}`)
    await onProgress({
      stage: 'done',
      progress: 100,
      message: 'Эвристический разбор (SUMMARY_API_BASE_URL не задан).',
      extracted,
      markdownPath: mdPath,
      markdownPreview: markdown.slice(0, 6000),
      markdownChars: markdown.length,
      markdownReady: true,
    })
    return { markdown, extracted, mdPath }
  } finally {
    if (abortByProject.get(project.id) === localAbort) abortByProject.delete(project.id)
    runningPipelines.delete(project.id)
  }
}

export function mergeProjectProgress(project, payload) {
  const next = applyExtraction(project, payload.extracted)
  const markdownPreview = payload.markdownPreview ?? next.markdownPreview
  return {
    ...next,
    status: payload.stage === 'done' ? 'ready' : payload.stage === 'error' ? 'error' : 'processing',
    progress: payload.progress ?? next.progress,
    pipelineStage: payload.stage,
    pipelineMessage: payload.message,
    markdownPreview,
    markdownReady: payload.markdownReady ?? Boolean(markdownPreview),
    markdownChars: payload.markdownChars ?? next.markdownChars,
  }
}

export { applyExtraction }
