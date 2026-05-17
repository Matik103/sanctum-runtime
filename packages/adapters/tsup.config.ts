import { defineConfig } from 'tsup'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/langchain.ts',
    'src/vercel-ai.ts',
    'src/openai-agents.ts',
    'src/mastra.ts',
  ],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'es2022',
})
