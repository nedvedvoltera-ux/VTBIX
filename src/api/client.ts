import type {
  CrmActivity,
  CrmContact,
  CrmDeal,
  CrmMailSettings,
  CrmPlan,
  CrmSourceOption,
  CrmSourceType,
  InfovodDecision,
  MediaJob,
  MediaPromptConfig,
  MediaPublication,
  MediaStatus,
  Project,
  PromptConfig,
} from '../types'

const API = import.meta.env.VITE_API_URL ?? '/api'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, { ...init, credentials: 'include' })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    const error = new Error(body.message || body.error || `api_${response.status}`) as Error & { status?: number; code?: string }
    error.status = response.status
    error.code = body.error
    throw error
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
  source?: 'local' | 'cloud'
  provider?: string
  label?: string
  latencyMs?: number
  reply?: string
  matched?: boolean
  error?: string
  checkedAt?: string
  cached?: boolean
}

export type LlmProviderOption = {
  id: string
  name: string
  network: string
  hint?: string
  baseUrl: string
  models: string[]
  keyHint?: string
  docsUrl?: string
  allowCustomUrl?: boolean
}

export type LlmSettings = {
  source: 'local' | 'cloud'
  provider: string
  model: string
  baseUrl: string
  hasApiKey: boolean
  apiKeyMasked: string
  local: {
    configured: boolean
    url: string
    model: string
  }
  providers: LlmProviderOption[]
  active: {
    source: 'local' | 'cloud'
    provider: string
    label: string
    model: string
    url: string
    configured: boolean
    missing: string[]
  }
}

export type PipelineHealth = {
  ok: boolean
  pipeline: {
    docling: ServicePing
    llm: ServicePing
    llmProbe: LlmProbe | null
    model: string
    source?: 'local' | 'cloud'
    label?: string
    provider?: string
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
    const response = await fetch(`${API}/health`, { credentials: 'include' })
    if (!response.ok) return null
    return (await response.json()) as PipelineHealth
  } catch {
    return null
  }
}

export async function probeLlm(force = false): Promise<LlmProbe> {
  try {
    const response = await fetch(`${API}/health/llm${force ? '?refresh=1' : ''}`, { credentials: 'include' })
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

export function deleteProject(projectId: string) {
  return request<{ ok: boolean; id: string }>(`/projects/${projectId}`, { method: 'DELETE' })
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

export function fetchMediaConfig() {
  return request<MediaPromptConfig>('/media/config')
}

export function putMediaConfig(payload: MediaPromptConfig) {
  return request<MediaPromptConfig>('/media/config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export function fetchMediaHits() {
  return request<MediaPublication[]>('/media/hits')
}

export function fetchMediaHit(id: string) {
  return request<MediaPublication>(`/media/hits/${id}`)
}

export function patchMediaHit(id: string, payload: { decision?: InfovodDecision; notes?: string; name?: string }) {
  return request<MediaPublication>(`/media/hits/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export function convertMediaHit(id: string) {
  return request<{ hit: MediaPublication; project?: Project; projectId: string; existed: boolean }>(`/media/hits/${id}/project`, {
    method: 'POST',
  })
}

export function deleteMediaHit(id: string) {
  return request<{ ok: boolean; id: string }>(`/media/hits/${id}`, { method: 'DELETE' })
}

export function clearMediaHits() {
  return request<{ ok: boolean }>('/media/hits', { method: 'DELETE' })
}

export function fetchMediaStatus() {
  return request<MediaStatus>('/media/status')
}

export function runMediaMonitor() {
  return request<{ job: MediaJob }>('/media/run', { method: 'POST' })
}

export function fetchLlmSettings() {
  return request<LlmSettings>('/settings/llm')
}

export function putLlmSettings(payload: {
  source: 'local' | 'cloud'
  provider?: string
  model?: string
  baseUrl?: string
  apiKey?: string
  clearApiKey?: boolean
}) {
  return request<LlmSettings>('/settings/llm', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export type AuthUser = {
  id: string
  login: string
  name: string
  role: 'user' | 'admin'
  pendingInvite?: boolean
  createdAt?: string
}

export type AuthStatus = {
  enabled: boolean
  setupRequired: boolean
  user: AuthUser | null
}

export type SystemSettings = {
  authEnabled: boolean
  setupRequired: boolean
  userCount: number
}

export function fetchAuthStatus() {
  return request<AuthStatus>('/auth/status')
}

export function login(loginName: string, password: string) {
  return request<{ user: AuthUser }>('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: loginName, password }),
  })
}

export function setupAdmin(payload: { name: string; login: string; password: string }) {
  return request<{ user: AuthUser }>('/auth/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export function logout() {
  return request<{ ok: boolean }>('/auth/logout', { method: 'POST' })
}

export function fetchSystemSettings() {
  return request<SystemSettings>('/settings/system')
}

export function putSystemSettings(authEnabled: boolean) {
  return request<SystemSettings>('/settings/system', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ authEnabled }),
  })
}

export function fetchUsers() {
  return request<AuthUser[]>('/users')
}

export function createUser(payload: { name: string; login: string; password?: string; role?: 'user' | 'admin'; invite?: boolean }) {
  return request<{ user: AuthUser; inviteToken?: string | null; invitePath?: string | null }>('/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export function patchUser(id: string, payload: { name?: string; role?: 'user' | 'admin'; password?: string }) {
  return request<{ user: AuthUser }>(`/users/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export function deleteUser(id: string) {
  return request<{ ok: boolean; id: string }>(`/users/${id}`, { method: 'DELETE' })
}

export function fetchInvite(token: string) {
  return request<{ name: string; login: string }>(`/auth/invite/${token}`)
}

export function acceptInvite(token: string, password: string) {
  return request<{ user: AuthUser }>(`/auth/invite/${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
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

export function fetchCrmDeals() {
  return request<CrmDeal[]>('/crm/deals')
}

export function fetchCrmDeal(id: string) {
  return request<CrmDeal>(`/crm/deals/${id}`)
}

export function fetchCrmSources() {
  return request<{ projects: CrmSourceOption[]; infovods: CrmSourceOption[] }>('/crm/sources')
}

export function lookupCrmDeal(query: { projectId?: string; infovodId?: string }) {
  const params = new URLSearchParams()
  if (query.projectId) params.set('projectId', query.projectId)
  if (query.infovodId) params.set('infovodId', query.infovodId)
  return request<{ deal: CrmDeal | null }>(`/crm/lookup?${params.toString()}`)
}

export function createCrmDeal(payload: { sourceType: CrmSourceType; projectId?: string; infovodId?: string; name?: string }) {
  return request<{ deal: CrmDeal; existed: boolean }>('/crm/deals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export function patchCrmDeal(id: string, payload: Partial<Pick<CrmDeal, 'name' | 'stage' | 'owner' | 'notes' | 'grantor' | 'industry' | 'country' | 'region'>>) {
  return request<CrmDeal>(`/crm/deals/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export function deleteCrmDeal(id: string) {
  return request<{ ok: boolean; id: string }>(`/crm/deals/${id}`, { method: 'DELETE' })
}

export function addCrmContact(id: string, payload: Omit<CrmContact, 'id'>) {
  return request<CrmDeal>(`/crm/deals/${id}/contacts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export function patchCrmContact(id: string, contactId: string, payload: Partial<CrmContact>) {
  return request<CrmDeal>(`/crm/deals/${id}/contacts/${contactId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export function deleteCrmContact(id: string, contactId: string) {
  return request<CrmDeal>(`/crm/deals/${id}/contacts/${contactId}`, { method: 'DELETE' })
}

export function addCrmActivity(id: string, payload: Partial<CrmActivity>) {
  return request<CrmDeal>(`/crm/deals/${id}/activities`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export function deleteCrmActivity(id: string, activityId: string) {
  return request<CrmDeal>(`/crm/deals/${id}/activities/${activityId}`, { method: 'DELETE' })
}

export function addCrmPlan(id: string, payload: Partial<CrmPlan>) {
  return request<CrmDeal>(`/crm/deals/${id}/plans`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export function patchCrmPlan(id: string, planId: string, payload: Partial<CrmPlan> & { result?: string }) {
  return request<CrmDeal>(`/crm/deals/${id}/plans/${planId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export function deleteCrmPlan(id: string, planId: string) {
  return request<CrmDeal>(`/crm/deals/${id}/plans/${planId}`, { method: 'DELETE' })
}

export function sendCrmEmail(id: string, payload: { to: string; cc?: string; subject: string; body: string }) {
  return request<{ deal: CrmDeal; sent: { ok: boolean; to: string[]; subject: string } }>(`/crm/deals/${id}/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export function fetchCrmMail() {
  return request<CrmMailSettings>('/crm/mail')
}

export function putCrmMail(payload: {
  host: string
  port: number
  secure: boolean
  user: string
  from?: string
  fromName?: string
  password?: string
  clearPassword?: boolean
}) {
  return request<CrmMailSettings>('/crm/mail', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export function testCrmMail() {
  return request<{ ok: boolean; connected: boolean; host?: string; user?: string }>('/crm/mail/test', { method: 'POST' })
}
