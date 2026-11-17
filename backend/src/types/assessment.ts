import type { Types } from 'mongoose'

export type TargetRole = 'Full Stack Developer' | 'Backend Developer' | 'Frontend Developer' | 'AI Engineer'
export type SkillStatus = 'Strong' | 'Developing' | 'Weak' | 'Missing'
export type ReadinessLevel = 'Needs Improvement' | 'Developing' | 'Moderate' | 'Job Ready'

export interface RoleSkill {
  name: string
  category: string
  weight: number
  expectedLevel: number
  aliases: string[]
}

export interface SkillBreakdown {
  skill: string
  category: string
  evidenceLevel: number
  expectedLevel: number
  weight: number
  score: number
  status: SkillStatus
}

export interface AssessmentDocument {
  userId: Types.ObjectId
  resumeId: Types.ObjectId
  targetRole: TargetRole
  readinessScore: number
  readinessLevel: ReadinessLevel
  skillBreakdown: SkillBreakdown[]
  strengths: string[]
  skillGaps: string[]
  recommendations: string[]
  createdAt: Date
}
