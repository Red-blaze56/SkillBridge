import type { Response } from 'express'
import type { AuthenticatedResumeRequest } from '../types/resume.js'
import { analyzeResume, getResumeAnalysis, ResumeAnalysisError } from '../services/resumeAnalysisService.js'
import { GeminiServiceError } from '../services/geminiService.js'

function getUserId(request: AuthenticatedResumeRequest): string {
  if (!request.user) throw new ResumeAnalysisError('Authentication required', 401)
  return request.user.id
}

function getResumeId(request: AuthenticatedResumeRequest): string {
  return typeof request.params.id === 'string' ? request.params.id : ''
}

function sendAnalysisError(response: Response, error: unknown): void {
  if (error instanceof ResumeAnalysisError || error instanceof GeminiServiceError) {
    response.status(error.statusCode).json({ error: error.message })
    return
  }
  response.status(502).json({ error: 'Resume analysis could not be completed' })
}

export async function analyzeResumeController(request: AuthenticatedResumeRequest, response: Response): Promise<void> {
  try {
    const result = await analyzeResume(getUserId(request), getResumeId(request))
    response.status(200).json({
      success: true,
      cached: result.cached,
      data: {
        resumeId: result.resume._id,
        analysisStatus: result.resume.analysisStatus,
        analysis: result.resume.analysisResult,
        analyzedAt: result.resume.analyzedAt,
      },
    })
  } catch (error) {
    sendAnalysisError(response, error)
  }
}

export async function reanalyzeResumeController(request: AuthenticatedResumeRequest, response: Response): Promise<void> {
  try {
    const result = await analyzeResume(getUserId(request), getResumeId(request), true)
    response.status(200).json({
      success: true,
      cached: false,
      data: {
        resumeId: result.resume._id,
        analysisStatus: result.resume.analysisStatus,
        analysis: result.resume.analysisResult,
        analyzedAt: result.resume.analyzedAt,
      },
    })
  } catch (error) {
    sendAnalysisError(response, error)
  }
}

export async function getResumeAnalysisController(request: AuthenticatedResumeRequest, response: Response): Promise<void> {
  try {
    const analysis = await getResumeAnalysis(getUserId(request), getResumeId(request))
    response.status(200).json({ success: true, data: analysis })
  } catch (error) {
    sendAnalysisError(response, error)
  }
}
