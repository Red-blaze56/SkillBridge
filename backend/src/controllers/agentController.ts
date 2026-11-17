import type { Response } from 'express'
import type { AuthenticatedResumeRequest } from '../types/resume.js'
import type { AgentWorkflowDocument } from '../types/agents.js'
import { AgentWorkflowError, getLatestAgentWorkflow, runAgentWorkflow } from '../services/agentWorkflowService.js'

function toResponse(workflow: AgentWorkflowDocument & { _id: unknown }) {
  return {
    workflowId: workflow._id,
    status: workflow.status,
    skillGapAnalysis: workflow.skillGapAnalysis,
    jobFinder: workflow.jobFinder,
    learningRoadmap: workflow.learningRoadmap,
    failures: workflow.failures,
    timings: workflow.timings,
    createdAt: workflow.createdAt,
  }
}

function sendError(response: Response, error: unknown, fallback: string): void {
  if (error instanceof AgentWorkflowError) {
    response.status(error.statusCode).json({ error: error.message })
    return
  }
  console.error(error)
  response.status(500).json({ error: fallback })
}

function assessmentId(request: AuthenticatedResumeRequest): string {
  return typeof request.params.id === 'string' ? request.params.id : ''
}

/** POST /api/assessment/:id/agents: run all three agents in parallel and save the result. */
export async function runAgentsController(request: AuthenticatedResumeRequest, response: Response): Promise<void> {
  if (!request.user) {
    response.status(401).json({ error: 'Authentication required' })
    return
  }
  try {
    const workflow = await runAgentWorkflow(request.user.id, assessmentId(request))
    response.status(201).json({ success: true, data: toResponse(workflow) })
  } catch (error) {
    sendError(response, error, 'Agent workflow could not be completed')
  }
}

/** GET /api/assessment/:id/agents: the latest saved run, without calling any AI. */
export async function getLatestAgentsController(request: AuthenticatedResumeRequest, response: Response): Promise<void> {
  if (!request.user) {
    response.status(401).json({ error: 'Authentication required' })
    return
  }
  try {
    const workflow = await getLatestAgentWorkflow(request.user.id, assessmentId(request))
    response.status(200).json({ success: true, data: toResponse(workflow) })
  } catch (error) {
    sendError(response, error, 'Agent results could not be loaded')
  }
}
