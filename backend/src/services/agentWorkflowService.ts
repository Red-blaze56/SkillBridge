import mongoose from 'mongoose'
import { Annotation, END, START, StateGraph } from '@langchain/langgraph'
import { AgentWorkflow } from '../models/AgentWorkflow.js'
import { Assessment } from '../models/Assessment.js'
import { JobMatch } from '../models/JobMatch.js'
import { Resume } from '../models/Resume.js'
import type { AssessmentDocument } from '../types/assessment.js'
import type { AgentFailure, AgentName, InterviewPreparationResult, JobMatchingResult, LearningRoadmapResult } from '../types/agents.js'
import type { ResumeAnalysisResult } from '../types/resumeAnalysis.js'
import { runInterviewAgent, runJobMatchingAgent, runLearningRoadmapAgent } from './agentServices.js'

export class AgentWorkflowError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message)
  }
}

interface WorkflowState {
  assessment: AssessmentDocument
  analysis: ResumeAnalysisResult
  learningRoadmap?: LearningRoadmapResult
  interviewPreparation?: InterviewPreparationResult
  jobMatching?: JobMatchingResult
  failures: AgentFailure[]
}

const WorkflowState = Annotation.Root({
  assessment: Annotation<AssessmentDocument>(),
  analysis: Annotation<ResumeAnalysisResult>(),
  learningRoadmap: Annotation<LearningRoadmapResult | undefined>(),
  interviewPreparation: Annotation<InterviewPreparationResult | undefined>(),
  jobMatching: Annotation<JobMatchingResult | undefined>(),
  failures: Annotation<AgentFailure[]>({ reducer: (current, update) => [...current, ...update], default: () => [] }),
})

function failure(agent: AgentName, error: unknown): AgentFailure {
  return { agent, error: error instanceof Error ? error.message : 'Agent failed' }
}

function createWorkflowGraph() {
  return new StateGraph(WorkflowState)
    .addNode('learningRoadmap', async (state) => {
      try {
        return { learningRoadmap: await runLearningRoadmapAgent(state.assessment, state.analysis) }
      } catch (error) {
        return { failures: [failure('learningRoadmap', error)] }
      }
    })
    .addNode('interviewPreparation', async (state) => {
      try {
        return { interviewPreparation: await runInterviewAgent(state.assessment, state.analysis) }
      } catch (error) {
        return { failures: [failure('interviewPreparation', error)] }
      }
    })
    .addNode('jobMatching', async (state) => {
      try {
        return { jobMatching: runJobMatchingAgent(state.analysis) }
      } catch (error) {
        return { failures: [failure('jobMatching', error)] }
      }
    })
    .addEdge(START, 'learningRoadmap')
    .addEdge(START, 'interviewPreparation')
    .addEdge(START, 'jobMatching')
    .addEdge('learningRoadmap', END)
    .addEdge('interviewPreparation', END)
    .addEdge('jobMatching', END)
    .compile()
}

export async function runAgentWorkflow(userId: string, assessmentId: string) {
  if (!mongoose.isValidObjectId(assessmentId)) throw new AgentWorkflowError('Invalid assessment id', 400)
  const assessment = await Assessment.findOne({ _id: assessmentId, userId }).lean()
  if (!assessment) throw new AgentWorkflowError('Assessment not found', 404)
  const resume = await Resume.findOne({ _id: assessment.resumeId, userId }).lean()
  if (!resume?.analysisResult || resume.analysisStatus !== 'completed') throw new AgentWorkflowError('Resume analysis must be completed before running agents', 409)

  const graph = createWorkflowGraph()
  const result = await graph.invoke({ assessment, analysis: resume.analysisResult, failures: [] } as WorkflowState)
  const workflow = await AgentWorkflow.create({
    userId,
    assessmentId,
    status: result.failures.length ? 'partial' : 'completed',
    learningRoadmap: result.learningRoadmap,
    interviewPreparation: result.interviewPreparation,
    jobMatching: result.jobMatching,
    failures: result.failures,
  })

  if (result.jobMatching) {
    await JobMatch.insertMany(result.jobMatching.matches.map((match) => ({ ...match, userId, assessmentId })))
  }
  return { workflow: workflow.toObject(), result }
}
