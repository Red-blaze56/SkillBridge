import mongoose from 'mongoose'
import { Resume } from '../models/Resume.js'
import { resumeAnalysisSchema, type ValidatedResumeAnalysis } from '../validators/resumeAnalysisValidator.js'
import { analyzeResumeWithGemini } from './geminiService.js'

export class ResumeAnalysisError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message)
  }
}

export async function analyzeResume(userId: string, resumeId: string, force = false) {
  if (!mongoose.isValidObjectId(resumeId)) throw new ResumeAnalysisError('Invalid resume id', 400)
  const resume = await Resume.findOne({ _id: resumeId, userId })
  if (!resume) throw new ResumeAnalysisError('Resume not found', 404)
  if (!force && resume.analysisStatus === 'completed' && resume.analysisResult) return { resume, cached: true }
  if (resume.analysisStatus === 'processing') throw new ResumeAnalysisError('Resume analysis is already in progress', 409)

  const claimed = await Resume.updateOne(
    { _id: resumeId, userId, analysisStatus: { $ne: 'processing' } },
    { $set: { analysisStatus: 'processing' }, $unset: { analysisError: 1 } },
  )
  if (claimed.modifiedCount !== 1) throw new ResumeAnalysisError('Resume analysis is already in progress', 409)

  try {
    const result = await analyzeResumeWithGemini(resume.extractedText)
    const validated = resumeAnalysisSchema.parse(result)
    const updated = await Resume.findOneAndUpdate(
      { _id: resumeId, userId },
      { $set: { analysisStatus: 'completed', analysisResult: validated, analyzedAt: new Date() }, $unset: { analysisError: 1 } },
      { new: true },
    )
    if (!updated) throw new ResumeAnalysisError('Resume not found', 404)
    return { resume: updated, cached: false }
  } catch (error) {
    const safeMessage = error instanceof ResumeAnalysisError ? error.message : 'Resume analysis failed'
    await Resume.updateOne({ _id: resumeId, userId }, { $set: { analysisStatus: 'failed', analysisError: safeMessage } })
    throw error
  }
}

export async function getResumeAnalysis(userId: string, resumeId: string) {
  if (!mongoose.isValidObjectId(resumeId)) throw new ResumeAnalysisError('Invalid resume id', 400)
  const resume = await Resume.findOne({ _id: resumeId, userId }).select('analysisStatus analysisResult analyzedAt analysisError')
  if (!resume) throw new ResumeAnalysisError('Resume not found', 404)
  return resume
}
