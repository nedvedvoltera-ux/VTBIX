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

export async function apiHealth(): Promise<boolean> {
  try {
    const data = await request<{ ok: boolean }>('/health')
    return Boolean(data.ok)
  } catch {
    return false
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

export type UploadResult = {
  project: Project
  extracted: {
    name: string
    industry: string
    country: string
    region: string
    budget: number
  }
}

export async function uploadProjectFile(projectId: string, file: File, notes: string) {
  const body = new FormData()
  body.append('file', file)
  body.append('notes', notes)
  return request<UploadResult>(`/projects/${projectId}/file`, { method: 'POST', body })
}
