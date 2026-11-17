export const skillCategories = [
  'Programming Languages',
  'Programming Language',
  'Frontend',
  'Backend',
  'Database',
  'AI/ML',
  'Tools',
  'Core CS',
] as const

export const proficiencyLevels = ['Beginner', 'Intermediate', 'Advanced', 'Unknown'] as const

export interface PersonalInfo {
  name: string
  email: string
  phone: string
}

export interface EducationItem {
  degree: string
  institution: string
  graduationYear: string
}

export interface SkillItem {
  name: string
  category: (typeof skillCategories)[number]
  proficiency: (typeof proficiencyLevels)[number]
  evidence: string
}

export interface ProjectItem {
  name: string
  description: string
  technologies: string[]
}

export interface ExperienceItem {
  title: string
  company: string
  duration: string
  description: string
}

export interface ResumeAnalysisResult {
  personalInfo: PersonalInfo
  education: EducationItem[]
  skills: SkillItem[]
  projects: ProjectItem[]
  experience: ExperienceItem[]
  certifications: string[]
  strengths: string[]
  missingInformation: string[]
}

export type AnalysisStatus = 'pending' | 'processing' | 'completed' | 'failed'
