/**
 * Browser-use / Stagehand / browser-automation agent adapter for Sanctum Runtime.
 *
 * These agents drive a real browser (Playwright / Puppeteer) via LLM-decided
 * primitives like click, type, navigate, scroll, extract. Every primitive is
 * a high-stakes action: a misclicked button can fire a transaction, a typed
 * password can leak. Gate them at the dispatch layer.
 */
import type { SanctumAdapterOptions } from './types.js'
import { gate } from './gate.js'
import { SanctumBlockedError, SanctumVerificationTimeoutError } from './errors.js'

export type BrowserAction = {
  /** click / type / navigate / scroll / extract / press_key / select / submit / download */
  type: string
  /** Element selector, URL, key, or extraction prompt — whatever this action needs. */
  target?: string
  /** Text to type, value to select, file to download, etc. */
  value?: string
  /** Current page URL for context — fed into Sanctum source-trust heuristics. */
  currentUrl?: string
  /** Page title for human-readable audit. */
  pageTitle?: string
}

/**
 * Gate a single browser-use action before the browser executes it.
 *
 * @example
 * ```ts
 * const safeExecute = wrapBrowserActionExecutor(
 *   (action) => browser.execute(action),
 *   { client, agentId: 'browser-use:research' },
 * )
 * await safeExecute({ type: 'click', target: 'button[type=submit]', currentUrl: page.url() })
 * ```
 */
export function wrapBrowserActionExecutor<T>(
  execute: (action: BrowserAction) => Promise<T>,
  options: SanctumAdapterOptions,
): (action: BrowserAction) => Promise<T> {
  return async (action) => {
    await gate(
      {
        action: `browser:${action.type}`,
        params: { target: action.target, value: action.value },
        actor: options.agentId ?? 'browser-agent',
        context: {
          // Web page is an untrusted instruction source — the page the agent
          // is reading could be steering its behaviour (indirect injection).
          instructionSource: 'untrusted_content',
          destination: action.currentUrl,
          pageTitle: action.pageTitle,
        },
      },
      options,
    )
    return execute(action)
  }
}

export { SanctumBlockedError, SanctumVerificationTimeoutError }
