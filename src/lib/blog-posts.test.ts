import { describe, expect, it } from 'vitest'
import { getBlogAnswerPost } from './blog-posts'

describe('getBlogAnswerPost', () => {
  it('does not treat inherited Object properties as posts', () => {
    for (const slug of ['toString', 'constructor', '__proto__'] as const) {
      const result = getBlogAnswerPost(slug)
      expect(result).toBeUndefined()
      expect(typeof result).not.toBe('function')
    }
  })
})
