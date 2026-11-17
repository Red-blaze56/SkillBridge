import type { Types } from 'mongoose'

/* ---------- Skill Gap Analyzer Agent ---------- */

export type GapSeverity = 'Critical' | 'High' | 'Medium' | 'Low'

export interface SkillGapItem {
  skill: string
  severity: GapSeverity
  currentLevel: string
  targetLevel: string
  whyItMatters: string
  actions: string[]
  estimatedWeeks: number
}

export interface SkillGapAnalysisResult {
  agent: 'Skill Gap Analyzer Agent'
  summary: string
  gaps: SkillGapItem[]
  quickWins: string[]
}

/* ---------- Job Finder Agent ---------- */

export type JobEligibility = 'Eligible' | 'Partially Eligible' | 'Not Eligible'

export interface FoundJob {
  id: string
  title: string
  company: string
  location: string
  description: string
  url?: string
  postedAt?: string
  salary?: string
  contractType?: string
  requiredSkills: string[]
  matchedSkills: string[]
  missingSkills: string[]
  matchPercentage: number
  eligibility: JobEligibility
}

export interface JobFinderResult {
  agent: 'Job Finder Agent'
  source: 'adzuna' | 'sample'
  query: string
  location: string
  summary: string
  jobs: FoundJob[]
}

/* ---------- Learning Roadmap Agent ---------- */

export interface LearningRoadmapDay {
  day: number
  topic: string
  tasks: string[]
  estimatedHours: number
  priority: 'High' | 'Medium' | 'Low'
  reason: string
}

export interface LearningRoadmapResult {
  agent: 'Learning Roadmap Agent'
  summary: string
  roadmap: LearningRoadmapDay[]
}

/* ---------- Workflow ---------- */

export type AgentName = 'skillGapAnalysis' | 'jobFinder' | 'learningRoadmap'

export interface AgentFailure {
  agent: AgentName
  error: string
}

export interface AgentWorkflowDocument {
  userId: Types.ObjectId
  assessmentId: Types.ObjectId
  status: 'completed' | 'partial'
  skillGapAnalysis?: SkillGapAnalysisResult
  jobFinder?: JobFinderResult
  learningRoadmap?: LearningRoadmapResult
  failures: AgentFailure[]
  /** Milliseconds each agent took, plus `totalMs` for the whole parallel run. */
  timings?: Partial<Record<AgentName | 'totalMs', number>>
  createdAt: Date
}
