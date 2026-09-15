const listeners = new Map()

export function subscribeJob(jobId, res) {
  if (!listeners.has(jobId)) listeners.set(jobId, new Set())
  listeners.get(jobId).add(res)
  res.on('close', () => unsubscribeJob(jobId, res))
}

export function unsubscribeJob(jobId, res) {
  const set = listeners.get(jobId)
  if (!set) return
  set.delete(res)
  if (!set.size) listeners.delete(jobId)
}

export function emitJob(jobId, event, data) {
  const set = listeners.get(jobId)
  if (!set?.size) return
  const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  for (const res of set) {
    try {
      res.write(frame)
    } catch {
      unsubscribeJob(jobId, res)
    }
  }
}

export function closeJobStream(jobId) {
  const set = listeners.get(jobId)
  if (!set) return
  for (const res of set) {
    try {
      res.end()
    } catch {
      // already closed
    }
  }
  listeners.delete(jobId)
}
