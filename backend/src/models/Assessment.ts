import { Schema, model } from 'mongoose'
import type { AssessmentDocument, ReadinessLevel, SkillStatus, TargetRole } from '../types/assessment.js'

const skillBreakdownSchema = new Schema(
  {
    skill: { type: String, required: true },
    category: { type: String, required: true },
    evidenceLevel: { type: Number, required: true, min: 0, max: 3 },
    expectedLevel: { type: Number, required: true, min: 1, max: 3 },
    weight: { type: Number, required: true, min: 0, max: 100 },
    score: { type: Number, required: true, min: 0, max: 100 },
    status: { type: String, required: true, enum: ['Strong', 'Developing', 'Weak', 'Missing'] as SkillStatus[] },
  },
  { _id: false },
)

const assessmentSchema = new Schema<AssessmentDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    resumeId: { type: Schema.Types.ObjectId, ref: 'Resume', required: true, index: true },
    targetRole: { type: String, required: true, enum: ['Full Stack Developer', 'Backend Developer', 'Frontend Developer', 'AI Engineer'] as TargetRole[] },
    readinessScore: { type: Number, required: true, min: 0, max: 100 },
    readinessLevel: { type: String, required: true, enum: ['Needs Improvement', 'Developing', 'Moderate', 'Job Ready'] as ReadinessLevel[] },
    skillBreakdown: { type: [skillBreakdownSchema], required: true },
    strengths: { type: [String], required: true },
    skillGaps: { type: [String], required: true },
    recommendations: { type: [String], required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
)

export const Assessment = model<AssessmentDocument>('Assessment', assessmentSchema)
