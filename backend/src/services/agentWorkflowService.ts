import mongoose from 'mongoose'
import { Annotation, END, START, StateGraph } from '@langchain/langgraph'
import { AgentWorkflow } from '../models/AgentWorkflow.js'
import { Assessment } from '../models/Assessment.js'
import { Resume } from '../models/Resume.js'
import type { AssessmentDocument } from '../types/assessment.js'
import type { AgentFailure, AgentName, JobFinderResult, LearningRoadmapResult, SkillGapAnalysisResult } from '../types/agents.js'
import type { ResumeAnalysisResult } from '../types/resumeAnalysis.js'
import { runJobFinderAgent, runLearningRoadmapAgent, runSkillGapAgent } from './agentServices.js'

export class AgentWorkflowError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message)
  }
}

/**
 * Shared LangGraph state. Every agent reads `assessment` + `analysis` and writes only its own key,
 * so the three branches can run at the same time without conflicting. `failures` and `timings`
 * use reducers so each branch can append to them in parallel.
 */
const WorkflowState = Annotation.Root({
  assessment: Annotation<AssessmentDocument>(),
  analysis: Annotation<ResumeAnalysisResult>(),
  skillGapAnalysis: Annotation<SkillGapAnalysisResult | undefined>(),
  jobFinder: Annotation<JobFinderResult | undefined>(),
  learningRoadmap: Annotation<LearningRoadmapResult | undefined>(),
  failures: Annotation<AgentFailure[]>({ reducer: (current, update) => [...current, ...update], default: () => [] }),
  timings: Annotation<Partial<Record<AgentName, number>>>({ reducer: (current, update) => ({ ...current, ...update }), default: () => ({}) }),
})

type State = typeof WorkflowState.State
type AgentRunner<T> = (assessment: AssessmentDocument, analysis: ResumeAnalysisResult) => Promise<T>

/** Wrap an agent as a graph node: time it, store its output, and record a failure instead of crashing the graph. */
function agentNode<K extends AgentName>(name: K, run: AgentRunner<NonNullable<State[K]>>) {
  return async (state: State) => {
    const started = Date.now()
    try {
      const output = await run(state.assessment, state.analysis)
      return { [name]: output, timings: { [name]: Date.now() - started } }
    } catch (error) {
      return {
        failures: [{ agent: name, error: error instanceof Error ? error.message.slice(0, 300) : 'Agent failed' }],
        timings: { [name]: Date.now() - started },
      }
    }
  }
}

// Node names must differ from state keys (LangGraph rejects a node called "jobFinder" when the state has a "jobFinder" field).
//
//            ┌─► skillGapAgent ────────┐
//   START ───┼─► jobFinderAgent ───────┼──► END
//            └─► learningRoadmapAgent ─┘
const workflowGraph = new StateGraph(WorkflowState)
  .addNode('skillGapAgent', agentNode('skillGapAnalysis', runSkillGapAgent))
  .addNode('jobFinderAgent', agentNode('jobFinder', runJobFinderAgent))
  .addNode('learningRoadmapAgent', agentNode('learningRoadmap', runLearningRoadmapAgent))
  .addEdge(START, 'skillGapAgent')
  .addEdge(START, 'jobFinderAgent')
  .addEdge(START, 'learningRoadmapAgent')
  .addEdge('skillGapAgent', END)
  .addEdge('jobFinderAgent', END)
  .addEdge('learningRoadmapAgent', END)
  .compile()

async function loadOwnedAssessment(userId: string, assessmentId: string) {
  if (!mongoose.isValidObjectId(assessmentId)) throw new AgentWorkflowError('Invalid assessment id', 400)
  const assessment = await Assessment.findOne({ _id: assessmentId, userId }).lean()
  if (!assessment) throw new AgentWorkflowError('Assessment not found', 404)
  return assessment
}

export async function runAgentWorkflow(userId: string, assessmentId: string) {
  const assessment = await loadOwnedAssessment(userId, assessmentId)
  const resume = await Resume.findOne({ _id: assessment.resumeId, userId }).lean()
  if (!resume?.analysisResult || resume.analysisStatus !== 'completed') {
    throw new AgentWorkflowError('Resume analysis must be completed before running agents', 409)
  }

  const started = Date.now()
  const result = await workflowGraph.invoke({ assessment, analysis: resume.analysisResult })
  const totalMs = Date.now() - started

  const workflow = await AgentWorkflow.create({
    userId,
    assessmentId,
    status: result.failures.length ? 'partial' : 'completed',
    skillGapAnalysis: result.skillGapAnalysis,
    jobFinder: result.jobFinder,
    learningRoadmap: result.learningRoadmap,
    failures: result.failures,
    timings: { ...result.timings, totalMs },
  })
  return workflow.toObject()
}

/** The most recent saved run for an assessment, so pages can show results without re-running the agents. */
export async function getLatestAgentWorkflow(userId: string, assessmentId: string) {
  await loadOwnedAssessment(userId, assessmentId)
  const workflow = await AgentWorkflow.findOne({ assessmentId, userId }).sort({ createdAt: -1 }).lean()
  if (!workflow) throw new AgentWorkflowError('No agent results yet for this assessment', 404)
  return workflow
}
