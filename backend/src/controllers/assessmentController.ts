import type { Response } from 'express'
import { ZodError } from 'zod'
import { assessmentRequestSchema } from '../validators/assessmentValidator.js'
import { AssessmentError, createAssessment, getAssessment, getAssessmentHistory } from '../services/assessmentService.js'
import type { AuthenticatedResumeRequest } from '../types/resume.js'

function sendError(response: Response, error: unknown): void {
  if (error instanceof AssessmentError) {
    response.status(error.statusCode).json({ error: error.message })
    return
  }
  response.status(500).json({ error: 'Assessment could not be completed' })
}

function authenticatedUserId(request: AuthenticatedResumeRequest): string {
  if (!request.user) throw new AssessmentError('Authentication required', 401)
  return request.user.id
}

export async function createAssessmentController(request: AuthenticatedResumeRequest, response: Response): Promise<void> {
  try {
    const input = assessmentRequestSchema.parse(request.body)
    const assessment = await createAssessment(authenticatedUserId(request), input.resumeId, input.targetRole)
    response.status(201).json({ success: true, data: assessment })
  } catch (error) {
    if (error instanceof ZodError) {
      response.status(400).json({ error: 'resumeId and a supported targetRole are required' })
      return
    }
    sendError(response, error)
  }
}

export async function getAssessmentController(request: AuthenticatedResumeRequest, response: Response): Promise<void> {
  try {
    const assessment = await getAssessment(authenticatedUserId(request), typeof request.params.id === 'string' ? request.params.id : '')
    response.status(200).json({ success: true, data: assessment })
  } catch (error) {
    sendError(response, error)
  }
}

export async function getAssessmentHistoryController(request: AuthenticatedResumeRequest, response: Response): Promise<void> {
  try {
    response.status(200).json({ success: true, data: await getAssessmentHistory(authenticatedUserId(request)) })
  } catch (error) {
    sendError(response, error)
  }
}
