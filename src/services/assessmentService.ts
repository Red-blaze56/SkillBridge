import { apiRequest } from './api'

export interface SkillBreakdown {
  skill: string
  category: string
  evidenceLevel: number
  expectedLevel: number
  weight: number
  score: number
  status: string
}

export interface Assessment {
  _id: string
  resumeId: string
  targetRole: string
  readinessScore: number
  readinessLevel: string
  skillBreakdown: SkillBreakdown[]
  strengths: string[]
  skillGaps: string[]
  recommendations: string[]
  createdAt: string
}

export async function createAssessment(resumeId: string, targetRole: string): Promise<Assessment> {
  const response = await apiRequest<{ data: Assessment }>('/assessment', {
    method: 'POST',
    body: JSON.stringify({ resumeId, targetRole }),
  })
  return response.data
}

export async function getAssessment(id: string): Promise<Assessment> {
  const response = await apiRequest<{ data: Assessment }>(`/assessment/${id}`)
  return response.data
}

export async function getAssessmentHistory(): Promise<Assessment[]> {
  const response = await apiRequest<{ data: Assessment[] }>('/assessment/history')
  return response.data
}
