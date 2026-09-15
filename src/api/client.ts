import type { Project, PromptConfig } from '../types'

const API = import.meta.env.VITE_API_URL ?? '/api'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, init)
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.message || body.error || `api_${response.status}`)
  }
  return response.json() as Promise<T>
}

export type ServicePing = {
  ok: boolean
  configured?: boolean
  error?: string
  url?: string
  model?: string
}

export type LlmProbe = {
  ok: boolean
  configured: boolean
  model?: string
  url?: string
  latencyMs?: number
  reply?: string
  matched?: boolean
  error?: string
  checkedAt?: string
  cached?: boolean
}

export type PipelineHealth = {
  ok: boolean
  pipeline: {
    docling: ServicePing
    llm: ServicePing
    llmProbe: LlmProbe | null
    model: string
  }
}

export async function apiHealth(): Promise<boolean> {
  try {
    const data = await request<{ ok: boolean }>('/health')
    return Boolean(data.ok)
  } catch {
    return false
  }
}

export async function fetchHealth(): Promise<PipelineHealth | null> {
  try {
    const response = await fetch(`${API}/health`)
    if (!response.ok) return null
    return (await response.json()) as PipelineHealth
  } catch {
    return null
  }
}

export async function probeLlm(force = false): Promise<LlmProbe> {
  try {
    const response = await fetch(`${API}/health/llm${force ? '?refresh=1' : ''}`)
    const data = (await response.json().catch(() => ({}))) as LlmProbe
    return {
      ...data,
      ok: Boolean(data.ok),
      configured: Boolean(data.configured),
    }
  } catch (error) {
    return {
      ok: false,
      configured: true,
      error: error instanceof Error ? error.message : 'не удалось вызвать /api/health/llm',
      checkedAt: new Date().toISOString(),
    }
  }
}

export function fetchProjects() {
  return request<Project[]>('/projects')
}

export function putProject(project: Project) {
  return request<Project>(`/projects/${project.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(project),
  })
}

export function fetchPrompt() {
  return request<PromptConfig | null>('/prompt')
}

export function putPrompt(prompt: PromptConfig) {
  return request<PromptConfig>('/prompt', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(prompt),
  })
}

export type JobInfo = {
  id: string
  projectId: string
  status: string
  stage?: string
  fileName?: string
  error?: string | null
}

export type UploadResult = {
  project: Project
  job: JobInfo
  extracted?: {
    name?: string
    industry?: string
    country?: string
    region?: string
    budget?: number
  }
}

export async function uploadProjectFiles(projectId: string, files: File[], notes: string) {
  const body = new FormData()
  for (const file of files) body.append('files', file)
  body.append('notes', notes)
  return request<UploadResult>(`/projects/${projectId}/file`, { method: 'POST', body })
}

export async function uploadProjectFile(projectId: string, file: File, notes: string) {
  return uploadProjectFiles(projectId, [file], notes)
}

export function deleteProjectDocument(projectId: string, docId: string) {
  return request<Project>(`/projects/${projectId}/documents/${docId}`, { method: 'DELETE' })
}

export function analyzeProject(projectId: string, notes?: string) {
  return request<UploadResult>(`/projects/${projectId}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notes: notes || '' }),
  })
}

export function jobStreamUrl(jobId: string) {
  return `${API}/jobs/${jobId}/stream`
}
