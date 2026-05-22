import { defineConfig } from 'tsup'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/langchain.ts',
    'src/vercel-ai.ts',
    'src/openai-agents.ts',
    'src/mastra.ts',
    'src/mcp.ts',
    'src/crewai.ts',
    'src/ros2.ts',
    'src/claude-desktop.ts',
    'src/n8n.ts',
    'src/autogen.ts',
    'src/pydantic-ai.ts',
    'src/llamaindex.ts',
    'src/smolagents.ts',
    'src/bedrock-agents.ts',
    'src/browser-use.ts',
    'src/home-assistant.ts',
  ],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'es2022',
  external: ['@sanctum-runtime/sdk'],
})
