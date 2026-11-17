import type { Types } from 'mongoose'
import type { JobMatchResult } from './job.js'

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

export interface InterviewQuestion {
  question: string
  topic: string
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced'
  reason: string
  sampleAnswer: string
}

export interface InterviewPreparationResult {
  agent: 'Interview Preparation Agent'
  summary: string
  questions: InterviewQuestion[]
}

export interface JobMatchingResult {
  agent: 'Job Matching Agent'
  summary: string
  matches: JobMatchResult[]
}

export type AgentName = 'learningRoadmap' | 'interviewPreparation' | 'jobMatching'
export type AgentStatus = 'completed' | 'failed'

export interface AgentFailure {
  agent: AgentName
  error: string
}

export interface AgentWorkflowDocument {
  userId: Types.ObjectId
  assessmentId: Types.ObjectId
  status: 'completed' | 'partial'
  learningRoadmap?: LearningRoadmapResult
  interviewPreparation?: InterviewPreparationResult
  jobMatching?: JobMatchingResult
  failures: AgentFailure[]
  createdAt: Date
}
