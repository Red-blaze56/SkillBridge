import { z } from 'zod'

export const skillGapAnalysisSchema = z.object({
  agent: z.literal('Skill Gap Analyzer Agent'),
  summary: z.string(),
  gaps: z.array(z.object({
    skill: z.string().min(1),
    severity: z.enum(['Critical', 'High', 'Medium', 'Low']),
    currentLevel: z.string(),
    targetLevel: z.string(),
    whyItMatters: z.string(),
    actions: z.array(z.string()).min(1).max(5),
    estimatedWeeks: z.number().min(0.5).max(26),
  })).max(8),
  quickWins: z.array(z.string()).max(5),
})

export const learningRoadmapSchema = z.object({
  agent: z.literal('Learning Roadmap Agent'),
  summary: z.string(),
  roadmap: z.array(z.object({
    day: z.number().int().min(1).max(7),
    topic: z.string(),
    tasks: z.array(z.string()).min(1),
    estimatedHours: z.number().min(0.5).max(8),
    priority: z.enum(['High', 'Medium', 'Low']),
    reason: z.string(),
  })).length(7),
})

export type ValidatedSkillGapAnalysis = z.infer<typeof skillGapAnalysisSchema>
export type ValidatedLearningRoadmap = z.infer<typeof learningRoadmapSchema>
