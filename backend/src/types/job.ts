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
