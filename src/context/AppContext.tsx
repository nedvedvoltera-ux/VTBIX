import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { apiHealth, fetchProjects, fetchPrompt, putProject, putPrompt } from '../api/client'
import { DEFAULT_PROMPT } from '../data/mock'
import type { Project, PromptConfig } from '../types'
import { hydratePrompt, normalizeMetrics } from '../utils/concession'
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
  return project
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>(() => readJson<Project[]>(PROJECTS_KEY, []).map(hydrateProject))
  const [prompt, setPromptState] = useState<PromptConfig>(() => hydratePrompt(readJson(PROMPT_KEY, DEFAULT_PROMPT), DEFAULT_PROMPT))
  const [apiOnline, setApiOnline] = useState(false)
  const apiOnlineRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const online = await apiHealth()
      if (cancelled) return
      apiOnlineRef.current = online
      setApiOnline(online)
      if (!online) return
      try {
        const remote = await fetchProjects()
        const remotePrompt = await fetchPrompt()
        if (cancelled) return
        setProjects(remote.map(hydrateProject))
        if (remotePrompt) setPromptState(hydratePrompt(remotePrompt, DEFAULT_PROMPT))
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

  const hasProcessing = projects.some((item) => item.status === 'processing')

  useEffect(() => {
    if (!apiOnline) return undefined
    const timer = window.setInterval(() => {
      void fetchProjects()
        .then((remote) => setProjects(remote.map(hydrateProject)))
        .catch(() => undefined)
    }, hasProcessing ? 1000 : 2500)
    return () => window.clearInterval(timer)
  }, [apiOnline, hasProcessing])

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
    const hydrated = { ...next, metrics: normalizeMetrics(next.metrics) }
    setPromptState(hydrated)
    if (apiOnlineRef.current) void putPrompt(hydrated)
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
    documents: [],
  }
}
