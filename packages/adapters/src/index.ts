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
 *   - n8n / Zapier / Make (workflow automation)
 *   - Microsoft AutoGen (multi-agent)
 *   - Pydantic AI (HTTP bridge to TS dispatchers)
 *   - LlamaIndex
 *   - Hugging Face smolagents (HTTP bridge)
 *   - AWS Bedrock Agents (action-group Lambdas)
 *   - Browser-use / Stagehand (browser automation)
 *   - Home Assistant (smart home service calls)
 *   - Provider-neutral model tool calls (OpenAI, Claude, Gemini, Grok,
 *     DeepSeek, NVIDIA NIM and other function-calling APIs)
 *
 * Anything not listed: use the generic `gate()` function — works with any
 * framework where you can `await` a Promise.
 */
export { gate } from './gate.js'

// Shared types
export type { SanctumAdapterOptions, ActionContext } from './types.js'

// Provider-neutral LLM / hosted model tool dispatch
export {
  gateModelToolCall,
  wrapModelToolExecutor,
  type ModelProvider,
  type ModelToolCall,
  type ModelToolOptions,
} from './model-tools.js'

// Error classes
export {
  SanctumBlockedError,
  SanctumVerificationTimeoutError,
  SanctumActionTokenRequiredError,
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

// n8n / Zapier / Make workflow adapter
export {
  gateN8nStep,
  type N8nStepInput,
} from './n8n.js'

// Microsoft AutoGen adapter
export {
  wrapAutoGenTool,
  createSanctumAutoGenHook,
  type AutoGenTool,
} from './autogen.js'

// Pydantic AI bridge adapter
export {
  gatePydanticAITool,
  type PydanticAIToolCall,
} from './pydantic-ai.js'

// LlamaIndex adapter
export {
  wrapLlamaIndexTool,
  type LlamaIndexTool,
} from './llamaindex.js'

// Hugging Face smolagents bridge adapter
export {
  gateSmolagentsCall,
  type SmolToolCall,
} from './smolagents.js'

// AWS Bedrock Agents adapter
export {
  gateBedrockAgentEvent,
  type BedrockAgentEvent,
} from './bedrock-agents.js'

// Browser-use / Stagehand adapter
export {
  wrapBrowserActionExecutor,
  type BrowserAction,
} from './browser-use.js'

// Home Assistant adapter
export {
  gateHassServiceCall,
  type HassServiceCall,
} from './home-assistant.js'
