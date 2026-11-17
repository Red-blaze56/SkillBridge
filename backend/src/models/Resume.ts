import { Schema, model } from 'mongoose'
import type { ResumeDocument, ResumeUploadStatus } from '../types/resume.js'
import type { AnalysisStatus } from '../types/resumeAnalysis.js'

const resumeSchema = new Schema<ResumeDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    originalFileName: { type: String, required: true, trim: true, maxlength: 255 },
    fileName: { type: String, required: true, trim: true, unique: true },
    fileSize: { type: Number, required: true, min: 1, max: 5 * 1024 * 1024 },
    mimeType: { type: String, required: true, enum: ['application/pdf'] },
    extractedText: { type: String, required: true },
    pageCount: { type: Number, required: true, min: 1 },
    uploadStatus: { type: String, required: true, enum: ['processed', 'failed'] as ResumeUploadStatus[], default: 'processed' },
    analysisStatus: { type: String, required: true, enum: ['pending', 'processing', 'completed', 'failed'] as AnalysisStatus[], default: 'pending' },
    analysisResult: { type: Schema.Types.Mixed },
    analyzedAt: { type: Date },
    analysisError: { type: String, maxlength: 500 },
  },
  { timestamps: true },
)

export const Resume = model<ResumeDocument>('Resume', resumeSchema)
