export const PROXY_PLATFORMS: Record<string, string> = {
  openai:   'https://api.openai.com/v1',
  deepseek: 'https://api.deepseek.com/v1',
  qwen:     'https://dashscope.aliyuncs.com/compatible-mode/v1',
  kimi:     'https://api.moonshot.cn/v1',
  doubao:   'https://ark.cn-beijing.volces.com/api/v3',
  gemini:   'https://generativelanguage.googleapis.com/v1beta/openai',
  claude:   'https://api.anthropic.com/v1',
  grok:     'https://api.x.ai/v1',
  nvidia:   'https://integrate.api.nvidia.com/v1',
  azure:    '', // requires org-scoped proxy_base_url on platform_credentials
  bedrock:  '', // requires org-scoped proxy_base_url (Bedrock OpenAI-compatible runtime)
}

export function platformRequiresCustomBase(platform: string): boolean {
  return platform === 'azure' || platform === 'bedrock'
}
