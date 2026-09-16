import { describe, expect, it } from 'vitest'

import { describeNetworkError, PipelineError } from '../../server/httpErrors.js'

describe('PipelineError', () => {
  it('запоминает этап падения и сообщение', () => {
    const error = new PipelineError('converting', 'Docling упал')
    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('PipelineError')
    expect(error.failedAt).toBe('converting')
    expect(error.message).toBe('Docling упал')
  })

  it('переносит сведения о markdown и документе', () => {
    const error = new PipelineError('extracting', 'модель не ответила', {
      markdownPreview: 'превью',
      markdownPath: 'D:/md/a.md',
      markdownChars: 1200,
      documentId: 'd1',
    })
    expect(error.markdownPreview).toBe('превью')
    expect(error.markdownPath).toBe('D:/md/a.md')
    expect(error.markdownChars).toBe(1200)
    expect(error.documentId).toBe('d1')
  })

  it('без дополнительных данных поля пустые', () => {
    const error = new PipelineError('extracting', 'нет ответа')
    expect(error.markdownPreview).toBeUndefined()
    expect(error.documentId).toBeUndefined()
  })
})

describe('describeNetworkError', () => {
  it('готовое сообщение этапа не переписывается', () => {
    const raw = 'Этап 2: модель не ответила'
    expect(describeNetworkError(new Error(raw), { service: 'LLM' })).toBe(raw)
  })

  it('сообщение с кодом ответа не переписывается', () => {
    const raw = 'Docling 504: gateway timeout'
    expect(describeNetworkError(new Error(raw), { service: 'Docling' })).toBe(raw)
  })

  it('сообщение о ненастроенном сервисе не переписывается', () => {
    const raw = 'Облачная модель не настроена'
    expect(describeNetworkError(new Error(raw), { service: 'LLM' })).toBe(raw)
  })

  it('сеть не дошла до сервиса', () => {
    const text = describeNetworkError(new Error('fetch failed'), { service: 'Docling' })
    expect(text).toBe('Docling недоступен (сеть не дошла до сервиса)')
  })

  it('отказ соединения с URL и кодом', () => {
    const error = new Error('boom')
    error.code = 'ECONNREFUSED'
    const text = describeNetworkError(error, { service: 'LLM', url: 'http://192.168.0.2:9080/v1' })
    expect(text).toContain('LLM недоступен')
    expect(text).toContain('URL http://192.168.0.2:9080/v1')
    expect(text).toContain('код ECONNREFUSED')
  })

  it('таймаут по коду', () => {
    const error = new Error('boom')
    error.code = 'ETIMEDOUT'
    expect(describeNetworkError(error, { service: 'LLM' })).toContain('LLM не ответил вовремя')
  })

  it('таймаут по имени ошибки', () => {
    const error = new Error('прервано')
    error.name = 'TimeoutError'
    expect(describeNetworkError(error, { service: 'Docling' })).toContain('Docling не ответил вовремя')
  })

  it('таймаут по тексту aborted', () => {
    expect(describeNetworkError(new Error('The operation was aborted'), { service: 'LLM' })).toContain('не ответил вовремя')
  })

  it('хост не найден', () => {
    const error = new Error('boom')
    error.code = 'ENOTFOUND'
    expect(describeNetworkError(error, { service: 'LLM' })).toContain('хост не найден')
  })

  it('код берётся из cause', () => {
    const error = new Error('боль', { cause: { code: 'UND_ERR_CONNECT_TIMEOUT' } })
    const text = describeNetworkError(error, { service: 'LLM' })
    expect(text).toContain('не ответил вовремя')
    expect(text).toContain('код UND_ERR_CONNECT_TIMEOUT')
  })

  it('добавляет пояснение из cause, если оно другое', () => {
    const error = new Error('боль', { cause: { code: 'ECONNREFUSED', message: 'connect ECONNREFUSED 192.168.0.2:9080' } })
    expect(describeNetworkError(error, { service: 'LLM' })).toContain('connect ECONNREFUSED 192.168.0.2:9080')
  })

  it('неизвестная ошибка идёт с именем сервиса', () => {
    expect(describeNetworkError(new Error('что-то своё'), { service: 'Docling' })).toBe('Docling: что-то своё')
  })

  it('строку вместо ошибки тоже понимает', () => {
    expect(describeNetworkError('сломалось', { service: 'LLM' })).toBe('LLM: сломалось')
  })

  it('без параметров сервис называется Сервис', () => {
    expect(describeNetworkError(new Error('fetch failed'))).toBe('Сервис недоступен (сеть не дошла до сервиса)')
  })
})
