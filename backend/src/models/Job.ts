import { Schema, model } from 'mongoose'
import type { JobDocument, JobImportance } from '../types/job.js'

const jobSchema = new Schema<JobDocument>(
  {
    jobTitle: { type: String, required: true },
    company: { type: String, required: true },
    location: { type: String, default: 'Not specified' },
    employmentType: { type: String, enum: ['Full-time', 'Internship', 'Remote'], required: true },
    description: { type: String, required: true },
    requiredSkills: [{
      name: { type: String, required: true },
      importance: { type: String, enum: ['Required', 'Preferred'] as JobImportance[], required: true },
      weight: { type: Number, required: true, min: 0 },
    }],
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
)

export const Job = model<JobDocument>('Job', jobSchema)
