export type ProjectStatus = 'draft' | 'queued' | 'processing' | 'ready' | 'error'

export type Recommendation = 'invest' | 'revise' | 'reject'

export type ConcessionFit = 'advantageous' | 'average' | 'unfavorable'

export type DebtSustainability = 'high' | 'mid' | 'low'

export type AcraOutlook = 'positive' | 'stable' | 'negative' | 'developing'

export type FinState = 'good' | 'mid' | 'bad'

export type PromptTone = 'formal' | 'board' | 'brief'
export type PromptDepth = 'brief' | 'standard' | 'deep'
export type OutputFormat = 'memo' | 'slides-outline' | 'table-first'
export type RecommendationStyle = 'traffic' | 'narrative'

export type FinancialRow = {
  metric: string
  value: string
  comment: string
  score?: number
}

export type MetricWeight = {
  name: string
  weight: number
}

export type ScenarioRow = {
  name: string
  npv: string
  irr: string
}

export type RiskRow = {
  title: string
  level: 'low' | 'mid' | 'high'
  text: string
}

export type TermRow = {
  id?: string
  label: string
  value: string
  group?: string
}

export type RiskBalance = {
  exceptions: string
  statement: string
}

export type ProjectAssessment = {
  imperativeLaw: string
  executionRealism: string
  investorFinance: string
}

export type AnalyticalNote = {
  executiveSummary: string
  description: string
  industryContext: string
  location: string
  budgetBreakdown: string
  financials: FinancialRow[]
  scenarios: ScenarioRow[]
  risks: RiskRow[]
  recommendation: string
  riskBalance?: RiskBalance
  terms?: TermRow[]
  assessment?: ProjectAssessment
}

export type ProjectDocument = {
  id: string
  fileName: string
  fileSize: number
  filePath?: string
  markdownPath?: string
  markdownPreview?: string
  markdownChars?: number
  markdownReady?: boolean
  status?: 'converting' | 'ready' | 'error'
  error?: string
  uploadedAt?: string
}

export type Project = {
  id: string
  name: string
  fileName: string | null
  fileSize: number | null
  documents?: ProjectDocument[]
  notes: string
  industry: string
  country: string
  region: string
  budget: number | null
  status: ProjectStatus
  progress: number
  createdAt: string
  updatedAt: string
  extractedByLlm: boolean
  owner: string
  recommendation?: Recommendation
  score?: number
  concessionFit?: ConcessionFit
  concessionScore?: number
  note?: AnalyticalNote
  pipelineStage?: 'converting' | 'extracting' | 'done' | 'error'
  pipelineFailedAt?: 'converting' | 'extracting'
  pipelineMessage?: string
  markdownPreview?: string
  markdownReady?: boolean
  markdownChars?: number
}

export type PromptSectionId =
  | 'executive'
  | 'description'
  | 'industry'
  | 'location'
  | 'budget'
  | 'financials'
  | 'scenarios'
  | 'risks'
  | 'comparables'
  | 'esg'
  | 'recommendation'

export type PromptConfig = {
  role: string
  language: 'ru' | 'en'
  tone: PromptTone
  depth: PromptDepth
  sections: Record<PromptSectionId, boolean>
  metrics: MetricWeight[]
  useEmployeeNotes: boolean
  includeComparables: boolean
  includeEsg: boolean
  outputFormat: OutputFormat
  recommendationStyle: RecommendationStyle
  extraInstructions: string
}

export type ExtractedFields = {
  name: string
  industry: string
  country: string
  region: string
  budget: number
}

export type MediaSearchMode = 'sites' | 'web'

export type MediaPromptConfig = {
  role: string
  extraInstructions: string
  keywords: string[]
  sites: string[]
  searchMode: MediaSearchMode
  language: 'ru' | 'en'
  lookbackDays: number
  maxResults: number
}

export type MediaFit = 'high' | 'mid' | 'low'

export type InfovodDecision = 'new' | 'watch' | 'pursue' | 'project' | 'dismissed'

export type InfovodNewsStage = 'announced' | 'design' | 'tender' | 'construction' | 'other'

export type MediaPublication = {
  id: string
  name: string
  title: string
  url: string
  source?: string
  publishedAt?: string
  projectName?: string
  country?: string
  region?: string
  industry?: string
  grantor?: string
  objectType?: string
  newsStage?: InfovodNewsStage
  budgetHint?: string
  budgetEstimate?: number | null
  snippet?: string
  summary?: string
  concessionAngle?: string
  nextStep?: string
  fit?: MediaFit
  score?: number
  decision: InfovodDecision
  notes?: string
  projectId?: string | null
  foundAt?: string
  updatedAt?: string
}

export type MediaJob = {
  id: string
  status: string
  stage?: string
  error?: string | null
  stats?: {
    found?: number
    pages?: number
    kept?: number
    query?: string
    provider?: string
    searchErrors?: string[]
  } | null
  createdAt?: string
  finishedAt?: string | null
}

export type MediaStatus = {
  running: boolean
  job: MediaJob | null
}

export type RegionRating = {
  id: string
  subject: string
  federalDistrict: string
  innExecutive: string
  innFinance: string
  debtSustain2425: DebtSustainability
  debtSustain2526: DebtSustainability
  acra2024: string
  acra2025: string
  acraOutlook: AcraOutlook
  acraDate: string
  ownRevenueShare2025: number
  debtToOwnRevenue: number
  commercialDebtShare: number
  finState: FinState
  concessionFit: ConcessionFit
  revenuesTotal: number
  revenuesGrants: number
  revenuesOwn: number
  debtTotal: number
  debtCommercial: number
  debtBudgetLoans: number
  debtBankLoans: number
  debtSecurities: number
  debtGuarantees: number
  debtMunicipalZone: number
  debtRedZone: number
}

export type CrmStage = 'lead' | 'contact' | 'meeting' | 'offer' | 'negotiation' | 'won' | 'lost' | 'hold'

export type CrmSourceType = 'project' | 'infovod'

export type CrmTouchKind = 'meeting' | 'call' | 'email' | 'note' | 'other'

export type CrmPlanStatus = 'open' | 'done' | 'cancelled'

export type CrmContact = {
  id: string
  name: string
  role?: string
  org?: string
  email?: string
  phone?: string
  isPrimary?: boolean
}

export type CrmActivity = {
  id: string
  kind: CrmTouchKind
  happenedAt: string
  title: string
  body: string
  author: string
  createdAt: string
}

export type CrmPlan = {
  id: string
  kind: CrmTouchKind
  dueAt?: string
  title: string
  body: string
  status: CrmPlanStatus
  createdAt: string
}

export type CrmDeal = {
  id: string
  name: string
  stage: CrmStage
  sourceType: CrmSourceType
  projectId?: string | null
  infovodId?: string | null
  industry?: string
  country?: string
  region?: string
  budget?: number | null
  grantor?: string
  owner: string
  notes?: string
  contacts: CrmContact[]
  activities: CrmActivity[]
  plans: CrmPlan[]
  nextTouchAt?: string | null
  createdAt: string
  updatedAt: string
}

export type CrmMailSettings = {
  host: string
  port: number
  secure: boolean
  user: string
  from: string
  fromName: string
  hasPassword: boolean
  passwordMasked?: string
  connected: boolean
}

export type CrmSourceOption = {
  id: string
  name: string
  industry?: string
  country?: string
  region?: string
  dealId?: string | null
  taken?: boolean
}

