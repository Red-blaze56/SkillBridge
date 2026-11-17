import { Schema, model } from 'mongoose'
import type { AgentWorkflowDocument } from '../types/agents.js'

const agentWorkflowSchema = new Schema<AgentWorkflowDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    assessmentId: { type: Schema.Types.ObjectId, ref: 'Assessment', required: true, index: true },
    status: { type: String, enum: ['completed', 'partial'], required: true },
    learningRoadmap: { type: Schema.Types.Mixed },
    interviewPreparation: { type: Schema.Types.Mixed },
    jobMatching: { type: Schema.Types.Mixed },
    failures: [{
      agent: { type: String, required: true },
      error: { type: String, required: true, maxlength: 300 },
    }],
  },
  { timestamps: { createdAt: true, updatedAt: false } },
)

export const AgentWorkflow = model<AgentWorkflowDocument>('AgentWorkflow', agentWorkflowSchema)
