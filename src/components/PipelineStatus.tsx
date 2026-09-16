import { useCallback, useEffect, useState } from 'react'
import { fetchHealth, probeLlm } from '../api/client'
import type { LlmProbe, PipelineHealth } from '../api/client'

function chipState(ok?: boolean, configured?: boolean, pending?: boolean) {
  if (pending) return 'wait'
  if (configured === false) return 'off'
  if (ok) return 'ok'
  return 'bad'
}

function chipLabel(ok?: boolean, configured?: boolean, pending?: boolean) {
  if (pending) return 'проверка'
  if (configured === false) return 'не задана'
  if (ok) return 'работает'
  return 'нет'
}

function formatProbe(probe: LlmProbe | null, pending: boolean) {
  if (pending) return 'Идёт тестовый запрос в модель (слово PONG)…'
  if (!probe) return 'Нажмите, чтобы отправить тестовый запрос в модель'
  if (!probe.configured) return probe.error || 'модель не настроена'
  const bits = []
  if (probe.label) bits.push(probe.label)
  if (probe.ok) bits.push(probe.matched ? 'ответила PONG' : `ответ: ${probe.reply || 'есть'}`)
  else bits.push(probe.error || 'модель не ответила')
  if (probe.latencyMs != null) bits.push(`${probe.latencyMs} мс`)
  if (probe.model) bits.push(probe.model)
  return bits.join(' · ')
}

export function PipelineStatus({ apiOnline }: { apiOnline: boolean }) {
  const [health, setHealth] = useState<PipelineHealth | null>(null)
  const [probe, setProbe] = useState<LlmProbe | null>(null)
  const [checking, setChecking] = useState(false)

  const refreshHealth = useCallback(async () => {
    const next = await fetchHealth()
    setHealth(next)
    if (next?.pipeline.llmProbe) setProbe(next.pipeline.llmProbe)
    return next
  }, [])

  const runProbe = useCallback(async (force = true) => {
    setChecking(true)
    try {
      const next = await probeLlm(force)
      setProbe(next)
      await refreshHealth()
    } catch (error) {
      setProbe({
        ok: false,
        configured: true,
        error: error instanceof Error ? error.message : String(error),
        checkedAt: new Date().toISOString(),
      })
    } finally {
      setChecking(false)
    }
  }, [refreshHealth])

  useEffect(() => {
    if (!apiOnline) {
      setHealth(null)
      return undefined
    }
    let cancelled = false
    setChecking(true)
    void (async () => {
      await refreshHealth()
      if (cancelled) return
      const next = await probeLlm(false)
      if (cancelled) return
      setProbe(next)
      setChecking(false)
    })()
    const timer = window.setInterval(() => {
      void refreshHealth()
    }, 15000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [apiOnline, refreshHealth])

  const docling = health?.pipeline.docling
  const llmReachable = health?.pipeline.llm
  const llmName = probe?.label || health?.pipeline.label || (health?.pipeline.source === 'cloud' ? 'LLM' : 'Qwen')

  return (
    <div className="topbar__status">
      <span className={`svc svc--${apiOnline ? 'ok' : 'bad'}`}>
        <span className="svc__full">{apiOnline ? 'API' : 'лок. кэш'}</span>
        <span className="svc__short">{apiOnline ? 'API' : 'кэш'}</span>
      </span>
      <button
        type="button"
        className={`svc svc--${chipState(docling?.ok, docling?.configured, apiOnline && !health)}`}
        title={docling?.error || (docling?.ok ? `Docling ${docling.url || 'доступен'}` : 'Docling не отвечает')}
        onClick={() => void refreshHealth()}
      >
        <span className="svc__full">Docling {chipLabel(docling?.ok, docling?.configured, apiOnline && !health)}</span>
        <span className="svc__short">Doc</span>
      </button>
      <button
        type="button"
        className={`svc svc--${chipState(probe?.ok ?? llmReachable?.ok, probe?.configured ?? llmReachable?.configured, checking)}`}
        title={formatProbe(probe, checking)}
        onClick={() => void runProbe(true)}
        disabled={checking}
      >
        <span className="svc__full">
          {llmName} {chipLabel(probe?.ok ?? llmReachable?.ok, probe?.configured ?? llmReachable?.configured, checking)}
        </span>
        <span className="svc__short">LLM</span>
      </button>
    </div>
  )
}
