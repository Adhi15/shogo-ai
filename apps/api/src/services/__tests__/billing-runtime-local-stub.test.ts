// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Shogo Technologies, Inc.
/**
 * Regression test for a local-mode-only bug: `billing-runtime.ts`'s
 * no-Stripe stub returned `{ allowed: true }` / `{ error: 'usage_limit' }`
 * instead of the `{ ok, reason? }` / `{ code, message }` shapes that
 * `project-chat.ts` and `workspace-chat.ts` destructure. Since neither route
 * checks `balanceCheck.ok` correctly against `{ allowed: true }`, EVERY chat
 * request in a `SHOGO_LOCAL_MODE=true` deployment (self-hosted / desktop)
 * was treated as over the usage limit, and the mis-shapen error payload
 * (`{ code: undefined, message: undefined }`) serialized to a bare
 * `{"error":{}}` body once `JSON.stringify` dropped the `undefined` fields
 * — surfacing as an opaque `{"error":{}}` banner in the chat UI on every
 * single turn instead of ever actually sending a message.
 *
 * This test locks the stub's shape to match `BalanceCheck` /
 * `usageLimitErrorPayload` from `billing.service.ts` so it can never drift
 * again without a route-level test catching it.
 */
import { describe, it, expect, beforeEach, afterEach } from 'bun:test'

describe('billing-runtime local-mode stub shape', () => {
  const originalEnv = process.env.SHOGO_LOCAL_MODE

  beforeEach(() => {
    process.env.SHOGO_LOCAL_MODE = 'true'
  })

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.SHOGO_LOCAL_MODE
    else process.env.SHOGO_LOCAL_MODE = originalEnv
  })

  it('checkUsageBalance resolves { ok: true }, not { allowed: true }', async () => {
    const billingService = await import('../billing-runtime')
    const result = await billingService.checkUsageBalance('any-workspace-id')
    expect(result).toEqual({ ok: true })
    // The bug: routes check `!balanceCheck.ok`. Guard against ever
    // regressing to a shape where that check is silently always-true.
    expect((result as any).ok).toBe(true)
  })

  it('usageLimitErrorPayload returns a real { code, message }, never undefined', async () => {
    const billingService = await import('../billing-runtime')
    const payload = billingService.usageLimitErrorPayload(undefined)
    expect(typeof payload.code).toBe('string')
    expect(payload.code.length).toBeGreaterThan(0)
    expect(typeof payload.message).toBe('string')
    expect(payload.message.length).toBeGreaterThan(0)
    // The bug: JSON.stringify({ error: { code, message } }) must never
    // collapse to `{"error":{}}`.
    expect(JSON.stringify({ error: payload })).not.toBe('{"error":{}}')
  })
})
