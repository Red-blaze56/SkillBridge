import type { Types } from 'mongoose'

export type EmploymentType = 'Full-time' | 'Internship' | 'Remote'
export type JobImportance = 'Required' | 'Preferred'

export interface JobSkill {
  name: string
  importance: JobImportance
  weight: number
}

export interface JobDocument {
  jobTitle: string
  company: string
  location: string
  employmentType: EmploymentType
  description: string
  requiredSkills: JobSkill[]
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

export interface MatchingDetail {
  skill: string
  required: boolean
  matched: boolean
  evidenceLevel: number
}

export interface JobMatchResult {
  jobId: string
  jobTitle: string
  company: string
  location: string
  employmentType: EmploymentType
  description: string
  requiredSkills: JobSkill[]
  matchedSkills: string[]
  missingSkills: string[]
  additionalSkills: string[]
  matchPercentage: number
  eligibility: 'Eligible' | 'Partially Eligible' | 'Not Eligible'
  matchingDetails: MatchingDetail[]
  explanation: string
  recommendations: string[]
}

export interface JobMatchDocument extends JobMatchResult {
  userId: Types.ObjectId
  assessmentId: Types.ObjectId
  jobId: string
  createdAt: Date
}
