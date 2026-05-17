/**
 * @sanctum-runtime/adapters
 *
 * Framework adapters for Sanctum Runtime.
 * Gates AI agent tool calls through Sanctum before execution.
 *
 * Supported frameworks (via duck typing — no peer dep install required):
 *   - LangChain / @langchain/core
 *   - Vercel AI SDK
 *   - OpenAI Agents SDK
 *   - Mastra
 */

// Shared types
export type { SanctumAdapterOptions, ActionContext } from './types.js'

// Error classes
export {
  SanctumBlockedError,
  SanctumVerificationTimeoutError,
} from './errors.js'

// LangChain adapter
export {
  wrapLangChainTool,
  createSanctumTools,
  SanctumToolWrapper,
  type LangChainToolDefinition,
} from './langchain.js'

// Vercel AI SDK adapter
export {
  sanctumTool,
  createSanctumMiddleware,
  type VercelAIToolDefinition,
} from './vercel-ai.js'

// OpenAI Agents SDK adapter
export {
  wrapAgentTool,
  createSanctumAgentHook,
  type OpenAIFunctionTool,
  type AgentHook,
} from './openai-agents.js'

// Mastra adapter
export {
  wrapMastraTool,
  createSanctumMastraMiddleware,
  type MastraTool,
  type MastraMiddleware,
} from './mastra.js'
