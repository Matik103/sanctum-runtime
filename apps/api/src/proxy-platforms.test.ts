import { describe, expect, it } from 'vitest'
import { platformRequiresCustomBase, PROXY_PLATFORMS } from './proxy-platforms.js'
import { resolvePlatformUpstreamBase } from './platform-credentials.js'

describe('proxy platforms', () => {
  it('includes grok, nvidia, and bedrock', () => {
    expect(PROXY_PLATFORMS).toMatchObject({
      grok: 'https://api.x.ai/v1',
      nvidia: 'https://integrate.api.nvidia.com/v1',
      bedrock: '',
    })
  })

  it('requires custom base URL for azure and bedrock', () => {
    expect(platformRequiresCustomBase('azure')).toBe(true)
    expect(platformRequiresCustomBase('bedrock')).toBe(true)
    expect(platformRequiresCustomBase('grok')).toBe(false)
  })

  it('resolves default upstreams for grok and nvidia', () => {
    expect(resolvePlatformUpstreamBase('grok', null)).toBe('https://api.x.ai/v1')
    expect(resolvePlatformUpstreamBase('nvidia', null)).toBe('https://integrate.api.nvidia.com/v1')
  })

  it('requires saved base URL for bedrock', () => {
    expect(resolvePlatformUpstreamBase('bedrock', null)).toBeNull()
    expect(resolvePlatformUpstreamBase('bedrock', 'https://bedrock-runtime.us-east-1.amazonaws.com/openai/v1'))
      .toBe('https://bedrock-runtime.us-east-1.amazonaws.com/openai/v1')
  })
})
