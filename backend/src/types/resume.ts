import type { Request } from 'express'
import type { Types } from 'mongoose'
import type { AnalysisStatus, ResumeAnalysisResult } from './resumeAnalysis.js'

export type ResumeUploadStatus = 'processed' | 'failed'

export interface ResumeDocument {
  userId: Types.ObjectId
  originalFileName: string
  fileName: string
  fileSize: number
  mimeType: string
  extractedText: string
  pageCount: number
  uploadStatus: ResumeUploadStatus
  analysisStatus: AnalysisStatus
  analysisResult?: ResumeAnalysisResult
  analyzedAt?: Date
  analysisError?: string
  createdAt: Date
  updatedAt: Date
}

export interface AuthenticatedResumeRequest extends Request {
  user?: {
    id: string
    email: string
  }
}
