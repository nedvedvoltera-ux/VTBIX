import { afterEach, describe, expect, it, vi } from 'vitest'

import { closeJobStream, emitJob, subscribeJob, unsubscribeJob } from '../../server/events.js'

function fakeRes() {
  const res = {
    frames: [],
    ended: false,
    handlers: {},
    write(frame) {
      res.frames.push(frame)
    },
    end() {
      res.ended = true
    },
    on(event, handler) {
      res.handlers[event] = handler
    },
  }
  return res
}

const jobs = new Set()

function job(id) {
  jobs.add(id)
  return id
}

afterEach(() => {
  for (const id of jobs) closeJobStream(id)
  jobs.clear()
})

describe('подписка на события задачи', () => {
  it('подписчик получает кадр SSE', () => {
    const id = job('job-1')
    const res = fakeRes()
    subscribeJob(id, res)
    emitJob(id, 'progress', { stage: 'converting', percent: 40 })
    expect(res.frames).toHaveLength(1)
    expect(res.frames[0]).toBe('event: progress\ndata: {"stage":"converting","percent":40}\n\n')
  })

  it('кадр уходит всем подписчикам задачи', () => {
    const id = job('job-2')
    const a = fakeRes()
    const b = fakeRes()
    subscribeJob(id, a)
    subscribeJob(id, b)
    emitJob(id, 'done', { ok: true })
    expect(a.frames).toHaveLength(1)
    expect(b.frames).toHaveLength(1)
  })

  it('чужая задача кадр не получает', () => {
    const mine = job('job-3')
    const other = job('job-4')
    const res = fakeRes()
    subscribeJob(mine, res)
    emitJob(other, 'progress', { percent: 1 })
    expect(res.frames).toHaveLength(0)
  })

  it('событие без подписчиков не падает', () => {
    expect(() => emitJob('job-none', 'progress', { percent: 1 })).not.toThrow()
  })

  it('после отписки кадры не приходят', () => {
    const id = job('job-5')
    const res = fakeRes()
    subscribeJob(id, res)
    unsubscribeJob(id, res)
    emitJob(id, 'progress', { percent: 10 })
    expect(res.frames).toHaveLength(0)
  })

  it('отписка неизвестной задачи безопасна', () => {
    expect(() => unsubscribeJob('job-ghost', fakeRes())).not.toThrow()
  })

  it('закрытие соединения отписывает подписчика', () => {
    const id = job('job-6')
    const res = fakeRes()
    subscribeJob(id, res)
    expect(typeof res.handlers.close).toBe('function')
    res.handlers.close()
    emitJob(id, 'progress', { percent: 20 })
    expect(res.frames).toHaveLength(0)
  })

  it('падение записи отписывает и не роняет остальных', () => {
    const id = job('job-7')
    const broken = fakeRes()
    broken.write = vi.fn(() => {
      throw new Error('socket closed')
    })
    const alive = fakeRes()
    subscribeJob(id, broken)
    subscribeJob(id, alive)

    expect(() => emitJob(id, 'progress', { percent: 30 })).not.toThrow()
    expect(alive.frames).toHaveLength(1)

    emitJob(id, 'progress', { percent: 60 })
    expect(broken.write).toHaveBeenCalledTimes(1)
    expect(alive.frames).toHaveLength(2)
  })

  it('закрытие потока завершает все ответы', () => {
    const id = 'job-8'
    const a = fakeRes()
    const b = fakeRes()
    subscribeJob(id, a)
    subscribeJob(id, b)
    closeJobStream(id)
    expect(a.ended).toBe(true)
    expect(b.ended).toBe(true)

    emitJob(id, 'progress', { percent: 90 })
    expect(a.frames).toHaveLength(0)
  })

  it('закрытие уже закрытого потока безопасно', () => {
    const id = 'job-9'
    const res = fakeRes()
    res.end = () => {
      throw new Error('already closed')
    }
    subscribeJob(id, res)
    expect(() => closeJobStream(id)).not.toThrow()
    expect(() => closeJobStream(id)).not.toThrow()
  })
})
