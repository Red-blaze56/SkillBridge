import { apiRequest } from './api'

export interface SkillGap {
  skill: string
  severity: 'Critical' | 'High' | 'Medium' | 'Low'
  currentLevel: string
  targetLevel: string
  whyItMatters: string
  actions: string[]
  estimatedWeeks: number
}

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
  eligibility: 'Eligible' | 'Partially Eligible' | 'Not Eligible'
}

export type AgentName = 'skillGapAnalysis' | 'jobFinder' | 'learningRoadmap'

export interface AgentResults {
  workflowId: string
  status: 'completed' | 'partial'
  skillGapAnalysis?: {
    agent: string
    summary: string
    gaps: SkillGap[]
    quickWins: string[]
  }
  jobFinder?: {
    agent: string
    source: 'adzuna' | 'sample'
    query: string
    location: string
    summary: string
    jobs: FoundJob[]
  }
  learningRoadmap?: {
    agent: string
    summary: string
    roadmap: {
      day: number
      topic: string
      tasks: string[]
      estimatedHours: number
      priority: string
      reason: string
    }[]
  }
  failures: {
    agent: AgentName
    error: string
  }[]
  timings?: Partial<Record<AgentName | 'totalMs', number>>
  createdAt: string
}

/** Run all three agents in parallel (takes several seconds) and save the result. */
export async function runAgents(assessmentId: string): Promise<AgentResults> {
  const response = await apiRequest<{ data: AgentResults }>(`/assessment/${assessmentId}/agents`, {
    method: 'POST',
  })
  return response.data
}

/** Load the last saved run for an assessment without calling the AI again. */
export async function getLatestAgents(assessmentId: string): Promise<AgentResults> {
  const response = await apiRequest<{ data: AgentResults }>(`/assessment/${assessmentId}/agents`)
  return response.data
}
