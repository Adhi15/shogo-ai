// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Shogo Technologies, Inc.
/**
 * Billing seam shared by chat routes.
 *
 * Local/desktop mode has no Stripe subscription or cloud wallet. Keeping the
 * cloud implementation behind this seam prevents the local route graph from
 * importing the Stripe-heavy billing service while preserving the same route
 * code and authorization behavior in cloud mode.
 */
let cloudBilling: any = null
if (process.env.SHOGO_LOCAL_MODE !== 'true') {
  cloudBilling = await import(new URL('./billing.service.ts', import.meta.url).href)
}

export const SYSTEM_WORKSPACE_ID = cloudBilling?.SYSTEM_WORKSPACE_ID ?? 'local-system'
// Shapes below MUST match `billing.service.ts`'s `BalanceCheck` (`{ ok, reason? }`)
// and `usageLimitErrorPayload`'s `{ code, message }` return value — callers
// (project-chat.ts, workspace-chat.ts) destructure those exact fields and
// `c.json()` silently drops `undefined` properties, so a shape mismatch here
// used to produce a body of literally `{"error":{}}` on every local-mode chat
// request instead of ever actually blocking on usage.
export const checkUsageBalance = (...args: any[]) =>
  cloudBilling?.checkUsageBalance?.(...args) ?? Promise.resolve({ ok: true })
export const usageLimitErrorPayload = (...args: any[]) =>
  cloudBilling?.usageLimitErrorPayload?.(...args) ?? {
    code: 'usage_limit_reached',
    message: "You've reached your usage limit. Enable usage-based pricing or upgrade your plan to continue.",
  }
export const hasAdvancedModelAccess = (...args: any[]) =>
  cloudBilling?.hasAdvancedModelAccess?.(...args) ?? Promise.resolve(true)
export const allocateMonthlyIncluded = (...args: any[]) =>
  cloudBilling?.allocateMonthlyIncluded?.(...args) ?? Promise.resolve(null)
export const consumeUsage = (...args: any[]) =>
  cloudBilling?.consumeUsage?.(...args) ?? Promise.resolve(null)
export const ensureSystemWorkspace = (...args: any[]) =>
  cloudBilling?.ensureSystemWorkspace?.(...args) ?? Promise.resolve(null)
export const getSubscription = (...args: any[]) =>
  cloudBilling?.getSubscription?.(...args) ?? Promise.resolve(null)
export const getUsageWallet = (...args: any[]) =>
  cloudBilling?.getUsageWallet?.(...args) ?? Promise.resolve(null)
export const getUsageWindows = (...args: any[]) =>
  cloudBilling?.getUsageWindows?.(...args) ?? Promise.resolve(null)
export const syncFromStripe = (...args: any[]) =>
  cloudBilling?.syncFromStripe?.(...args) ?? Promise.resolve(null)
export const hasBalance = (...args: any[]) =>
  cloudBilling?.hasBalance?.(...args) ?? Promise.resolve(true)
