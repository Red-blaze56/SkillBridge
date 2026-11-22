// Skill gap analysis: an AI agent cites resume evidence for each skill a role needs,
// code checks every citation, and code computes the readiness score and the gaps.
import type { AIMessage } from '@langchain/core/messages';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import type { AnalysisResult, Passage } from '@skillbridge/shared';
import type { Role } from '@skillbridge/roles';
import { assessResume, PROMPT_VERSION, type ModelFactory } from './agent.ts';
import { buildResult } from './score.ts';

export {
  assessResume,
  MAX_ROUNDS,
  NoEvidenceError,
  PROMPT_VERSION,
  SUBMIT_EVIDENCE,
  type Assessment,
  type ModelFactory,
  type ToolModel,
} from './agent.ts';
export { checkEvidence, LEVEL_NAMES, SECTION_CAP, type Evidence } from './evidence.ts';
export { buildResult, FORMULA_VERSION, readiness, targetLevel } from './score.ts';

/** Each Gemini call gets this long. MAX_ROUNDS calls must fit in the worker's lease. */
export const CALL_TIMEOUT_MS = 60_000;

/** Gemini through LangChain. Temperature 0 and no hidden retries: the job queue retries. */
export function geminiModel({ apiKey, model }: { apiKey: string; model: string }): ModelFactory {
  return (tools) => {
    const chat = new ChatGoogleGenerativeAI({ apiKey, model, temperature: 0, maxRetries: 0 });
    const bound = chat.bindTools(tools as Parameters<typeof chat.bindTools>[0]);
    return { invoke: (messages) => bound.invoke(messages, { timeout: CALL_TIMEOUT_MS }) as Promise<AIMessage> };
  };
}

export interface AnalyseInputs {
  role: Role;
  passages: Passage[];
  model: ModelFactory;
  /** The model's name, recorded with the result. */
  modelName: string;
}

export async function analyse({ role, passages, model, modelName }: AnalyseInputs): Promise<AnalysisResult> {
  const { evidence } = await assessResume({ role, passages, model });
  return buildResult({ role, evidence, promptVersion: PROMPT_VERSION, model: modelName });
}
