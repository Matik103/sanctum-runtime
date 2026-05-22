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
 *   - Model Context Protocol (MCP) servers
 *   - CrewAI
 *   - ROS2 (robotics)
 *   - Claude Desktop / computer-use
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

// MCP (Model Context Protocol) adapter
export {
  wrapMcpTool,
  createSanctumMcpHook,
  type McpTool,
} from './mcp.js'

// CrewAI adapter
export {
  wrapCrewAITool,
  createSanctumCrewHook,
  type CrewAITool,
} from './crewai.js'

// ROS2 robotics adapter
export {
  wrapRos2Dispatcher,
  createSanctumRos2Hook,
  type Ros2Dispatcher,
} from './ros2.js'

// Claude Desktop / computer-use adapter
export {
  gateClaudeToolUse,
  wrapClaudeDispatcher,
  type ToolUseBlock,
} from './claude-desktop.js'
