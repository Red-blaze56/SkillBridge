import { z } from 'zod'
import { proficiencyLevels, skillCategories } from '../types/resumeAnalysis.js'

export const resumeAnalysisSchema = z.object({
  personalInfo: z.object({
    name: z.string(),
    email: z.string(),
    phone: z.string(),
  }),
  education: z.array(z.object({
    degree: z.string(),
    institution: z.string(),
    graduationYear: z.string(),
  })),
  skills: z.array(z.object({
    name: z.string(),
    category: z.enum(skillCategories),
    proficiency: z.enum(proficiencyLevels),
    evidence: z.string(),
  })),
  projects: z.array(z.object({
    name: z.string(),
    description: z.string(),
    technologies: z.array(z.string()),
  })),
  experience: z.array(z.object({
    title: z.string(),
    company: z.string(),
    duration: z.string(),
    description: z.string(),
  })),
  certifications: z.array(z.string()),
  strengths: z.array(z.string()),
  missingInformation: z.array(z.string()),
})

export type ValidatedResumeAnalysis = z.infer<typeof resumeAnalysisSchema>
