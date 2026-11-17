import { z } from 'zod'

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

export const interviewPreparationSchema = z.object({
  agent: z.literal('Interview Preparation Agent'),
  summary: z.string(),
  questions: z.array(z.object({
    question: z.string(),
    topic: z.string(),
    difficulty: z.enum(['Beginner', 'Intermediate', 'Advanced']),
    reason: z.string(),
    sampleAnswer: z.string(),
  })).length(10),
})

export type ValidatedLearningRoadmap = z.infer<typeof learningRoadmapSchema>
export type ValidatedInterviewPreparation = z.infer<typeof interviewPreparationSchema>
