import type { Response } from 'express'
import mongoose from 'mongoose'
import type { AuthenticatedResumeRequest } from '../types/resume.js'
import { createResume, deleteResume, getResume, listResumes } from '../services/resumeService.js'

function userId(request: AuthenticatedResumeRequest): string {
  if (!request.user) throw new Error('Authentication required')
  return request.user.id
}

function resumeId(request: AuthenticatedResumeRequest): string {
  return typeof request.params.id === 'string' ? request.params.id : ''
}

function validResumeId(request: AuthenticatedResumeRequest, response: Response): string | null {
  const id = resumeId(request)
  if (!mongoose.isValidObjectId(id)) {
    response.status(400).json({ error: 'Invalid resume id' })
    return null
  }
  return id
}

export async function uploadResumeController(request: AuthenticatedResumeRequest, response: Response): Promise<void> {
  if (!request.file) {
    response.status(400).json({ error: 'A PDF resume file is required in the "resume" field' })
    return
  }
  const result = await createResume(userId(request), request.file)
  response.status(201).json({
    success: true,
    message: 'Resume uploaded and processed successfully',
    data: {
      resumeId: result.resume._id,
      originalFileName: result.resume.originalFileName,
      pageCount: result.pageCount,
      textExtracted: Boolean(result.resume.extractedText),
    },
  })
}

export async function listResumesController(request: AuthenticatedResumeRequest, response: Response): Promise<void> {
  response.status(200).json({ success: true, data: await listResumes(userId(request)) })
}

export async function getResumeController(request: AuthenticatedResumeRequest, response: Response): Promise<void> {
  const id = validResumeId(request, response)
  if (!id) return
  const resume = await getResume(userId(request), id)
  if (!resume) {
    response.status(404).json({ error: 'Resume not found' })
    return
  }
  response.status(200).json({ success: true, data: resume })
}

export async function deleteResumeController(request: AuthenticatedResumeRequest, response: Response): Promise<void> {
  const id = validResumeId(request, response)
  if (!id) return
  const resume = await deleteResume(userId(request), id)
  if (!resume) {
    response.status(404).json({ error: 'Resume not found' })
    return
  }
  response.status(200).json({ success: true, message: 'Resume deleted successfully' })
}
