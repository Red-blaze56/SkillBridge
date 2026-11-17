import type { Response } from 'express'
import type { AuthenticatedResumeRequest } from '../types/resume.js'
import { AgentWorkflowError, runAgentWorkflow } from '../services/agentWorkflowService.js'

export async function runAgentsController(request: AuthenticatedResumeRequest, response: Response): Promise<void> {
  try {
    if (!request.user) {
      response.status(401).json({ error: 'Authentication required' })
      return
    }
    const assessmentId = typeof request.params.id === 'string' ? request.params.id : ''
    const result = await runAgentWorkflow(request.user.id, assessmentId)
    response.status(201).json({
      success: true,
      data: {
        workflowId: result.workflow._id,
        status: result.workflow.status,
        learningRoadmap: result.result.learningRoadmap,
        interviewPreparation: result.result.interviewPreparation,
        jobMatching: result.result.jobMatching,
        failures: result.result.failures,
      },
    })
  } catch (error) {
    if (error instanceof AgentWorkflowError) {
      response.status(error.statusCode).json({ error: error.message })
      return
    }
    response.status(500).json({ error: 'Agent workflow could not be completed' })
  }
}
