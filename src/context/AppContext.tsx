import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { apiHealth, fetchProjects, fetchPrompt, putProject, putPrompt } from '../api/client'
import { DEFAULT_PROMPT, INITIAL_PROJECTS } from '../data/mock'
import type { Project, PromptConfig } from '../types'
import { deriveConcession } from '../utils/concession'
import { uid } from '../utils/format'

const PROJECTS_KEY = 'vtbih.projects'
const PROMPT_KEY = 'vtbih.prompt'

type AppContextValue = {
  projects: Project[]
  prompt: PromptConfig
  apiOnline: boolean
  upsertProject: (project: Project) => Promise<Project>
  updateProject: (id: string, patch: Partial<Project>) => Promise<void>
  setPrompt: (next: PromptConfig) => void
  resetPrompt: () => void
}

const AppContext = createContext<AppContextValue | null>(null)

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function hydrateProject(project: Project): Project {
  if (project.concessionFit && project.concessionScore != null) return project
  const seed = INITIAL_PROJECTS.find((item) => item.id === project.id)
  if (seed?.concessionFit) {
    return { ...project, concessionFit: seed.concessionFit, concessionScore: seed.concessionScore }
  }
  return { ...project, ...deriveConcession(project.score, project.recommendation) }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>(() => readJson<Project[]>(PROJECTS_KEY, []).map(hydrateProject))
  const [prompt, setPromptState] = useState<PromptConfig>(() => readJson(PROMPT_KEY, DEFAULT_PROMPT))
  const [apiOnline, setApiOnline] = useState(false)
  const apiOnlineRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const online = await apiHealth()
      if (cancelled) return
      apiOnlineRef.current = online
      setApiOnline(online)
      if (!online) {
        setProjects((prev) => (prev.length ? prev : INITIAL_PROJECTS.map(hydrateProject)))
        return
      }
      try {
        let remote = await fetchProjects()
        const remotePrompt = await fetchPrompt()
        if (cancelled) return
        if (!remote.length) {
          await Promise.all(INITIAL_PROJECTS.map((item) => putProject(hydrateProject(item))))
          remote = await fetchProjects()
        }
        setProjects(remote.map(hydrateProject))
        if (remotePrompt) setPromptState(remotePrompt)
        else await putPrompt(DEFAULT_PROMPT)
      } catch {
        apiOnlineRef.current = false
        setApiOnline(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects))
  }, [projects])

  useEffect(() => {
    localStorage.setItem(PROMPT_KEY, JSON.stringify(prompt))
  }, [prompt])

  useEffect(() => {
    if (apiOnline) return undefined
    const timer = window.setInterval(() => {
      setProjects((prev) =>
        prev.map((project) => {
          if (project.status !== 'processing') return project
          const nextProgress = Math.min(100, project.progress + Math.round(4 + Math.random() * 8))
          if (nextProgress >= 100) {
            const score = project.score ?? 70 + Math.round(Math.random() * 15)
            const recommendation = project.recommendation ?? 'revise'
            return {
              ...project,
              progress: 100,
              status: 'ready',
              updatedAt: new Date().toISOString(),
              recommendation,
              score,
              ...deriveConcession(score, recommendation),
              note: project.note ?? {
                executiveSummary: `Автоматический расчёт по «${project.name}» завершён. Бюджет ${project.budget ? `${(project.budget / 1_000_000_000).toFixed(1)} млрд ₽` : 'не указан'}. Требуется сверка допущений аналитиком.`,
                description: project.notes || 'Описание собрано из загруженного файла. Требуется валидация сотрудником.',
                industryContext: `Отрасль: ${project.industry}. Контекст рынка подставлен из отраслевого справочника (мок).`,
                location: [project.country, project.region].filter(Boolean).join(', '),
                budgetBreakdown: 'Структура CAPEX восстановлена укрупнённо. Детализация — в исходном файле.',
                financials: [
                  { metric: 'NPV', value: 'расчёт выполнен', comment: 'мок-результат' },
                  { metric: 'IRR', value: 'расчёт выполнен', comment: 'мок-результат' },
                ],
                scenarios: [
                  { name: 'Базовый', npv: 'положительный', irr: 'около hurdle' },
                  { name: 'Стресс', npv: 'на границе', irr: 'ниже hurdle' },
                ],
                risks: [
                  { title: 'Качество исходных данных', level: 'mid', text: 'Часть полей извлечена моделью автоматически.' },
                ],
                recommendation: 'Доработать: сверить извлечённые поля и пояснения перед выносом на комитет.',
              },
            }
          }
          return { ...project, progress: nextProgress, updatedAt: new Date().toISOString() }
        }),
      )
    }, 1800)
    return () => window.clearInterval(timer)
  }, [apiOnline])

  useEffect(() => {
    if (!apiOnline) return undefined
    const timer = window.setInterval(() => {
      void fetchProjects()
        .then((remote) => setProjects(remote.map(hydrateProject)))
        .catch(() => undefined)
    }, 2500)
    return () => window.clearInterval(timer)
  }, [apiOnline])

  const persist = useCallback(async (project: Project) => {
    if (!apiOnlineRef.current) return project
    try {
      return hydrateProject(await putProject(project))
    } catch {
      return project
    }
  }, [])

  const upsertProject = useCallback(
    async (project: Project) => {
      const saved = await persist(project)
      setProjects((prev) => {
        const index = prev.findIndex((item) => item.id === saved.id)
        if (index === -1) return [saved, ...prev]
        const next = [...prev]
        next[index] = saved
        return next
      })
      return saved
    },
    [persist],
  )

  const updateProject = useCallback(
    async (id: string, patch: Partial<Project>) => {
      setProjects((prev) => {
        const current = prev.find((item) => item.id === id)
        if (!current) return prev
        const nextProject = { ...current, ...patch, updatedAt: new Date().toISOString() }
        void persist(nextProject)
        return prev.map((item) => (item.id === id ? nextProject : item))
      })
    },
    [persist],
  )

  const setPrompt = useCallback((next: PromptConfig) => {
    setPromptState(next)
    if (apiOnlineRef.current) void putPrompt(next)
  }, [])

  const resetPrompt = useCallback(() => {
    setPromptState(DEFAULT_PROMPT)
    if (apiOnlineRef.current) void putPrompt(DEFAULT_PROMPT)
  }, [])

  const value = useMemo(
    () => ({ projects, prompt, apiOnline, upsertProject, updateProject, setPrompt, resetPrompt }),
    [projects, prompt, apiOnline, upsertProject, updateProject, setPrompt, resetPrompt],
  )

  return createElement(AppContext.Provider, { value }, children)
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside AppProvider')
  return ctx
}

export function createDraftProject(): Project {
  const now = new Date().toISOString()
  return {
    id: uid('p'),
    name: '',
    fileName: null,
    fileSize: null,
    notes: '',
    industry: '',
    country: '',
    region: '',
    budget: null,
    status: 'draft',
    progress: 0,
    createdAt: now,
    updatedAt: now,
    extractedByLlm: false,
    owner: 'Вы',
  }
}
