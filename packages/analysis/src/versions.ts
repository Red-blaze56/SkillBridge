// Everything that decides an analysis result, besides the resume and the role. Kept free
// of LangChain imports, so the API can compare a stored result without loading the agent.

/** Bump when the prompt or tool changes, so cached analyses aren't reused. */
export const PROMPT_VERSION = 'skill-evidence-2';
/** Bump when the readiness formula or the gap targets change. */
export const FORMULA_VERSION = '1.0.0';
/** The Gemini model the worker uses unless GEMINI_MODEL says otherwise. */
export const DEFAULT_GEMINI_MODEL = 'gemini-3.6-flash';
