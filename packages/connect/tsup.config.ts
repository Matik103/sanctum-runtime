import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/langchain.ts', 'src/openai.ts', 'src/mcp.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  target: 'es2022',
})
