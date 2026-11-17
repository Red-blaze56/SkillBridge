import { Schema, model } from 'mongoose'
import type { JobMatchDocument, JobImportance } from '../types/job.js'

const jobMatchSchema = new Schema<JobMatchDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    assessmentId: { type: Schema.Types.ObjectId, ref: 'Assessment', required: true, index: true },
    jobId: { type: String, required: true },
    jobTitle: { type: String, required: true },
    company: { type: String, required: true },
    location: { type: String, required: true },
    employmentType: { type: String, enum: ['Full-time', 'Internship', 'Remote'], required: true },
    description: { type: String, required: true },
    requiredSkills: [{
      name: { type: String, required: true },
      importance: { type: String, enum: ['Required', 'Preferred'] as JobImportance[], required: true },
      weight: { type: Number, required: true, min: 0 },
    }],
    matchedSkills: { type: [String], required: true },
    missingSkills: { type: [String], required: true },
    additionalSkills: { type: [String], required: true },
    matchPercentage: { type: Number, required: true, min: 0, max: 100 },
    eligibility: { type: String, enum: ['Eligible', 'Partially Eligible', 'Not Eligible'], required: true },
    matchingDetails: [{
      skill: { type: String, required: true },
      required: { type: Boolean, required: true },
      matched: { type: Boolean, required: true },
      evidenceLevel: { type: Number, required: true, min: 0, max: 3 },
    }],
    explanation: { type: String, required: true },
    recommendations: { type: [String], required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
)

export const JobMatch = model<JobMatchDocument>('JobMatch', jobMatchSchema)
