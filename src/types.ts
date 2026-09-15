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
}

export type Project = {
  id: string
  name: string
  fileName: string | null
  fileSize: number | null
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
  pipelineMessage?: string
  markdownPreview?: string
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

