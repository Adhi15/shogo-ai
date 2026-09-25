// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Shogo Technologies, Inc.
import { describe, expect, test } from 'bun:test'
import {
  MOBILE_WORKSPACE_CHROME_HEIGHT,
  MOBILE_WORKSPACE_IDENTITY_HEADER_HEIGHT,
  mobileWorkspaceHeaderClearance,
} from '../mobile-workspace-header-layout'

describe('mobileWorkspaceHeaderClearance', () => {
  test('reserves consistent product chrome without a safe-area inset', () => {
    expect(MOBILE_WORKSPACE_CHROME_HEIGHT).toBe(64)
    expect(MOBILE_WORKSPACE_IDENTITY_HEADER_HEIGHT).toBe(112)
    expect(mobileWorkspaceHeaderClearance(0, 'chrome')).toBe(64)
    expect(mobileWorkspaceHeaderClearance(0, 'identity')).toBe(112)
  })

  test('adds only the OS-owned safe-area inset', () => {
    expect(mobileWorkspaceHeaderClearance(59, 'chrome')).toBe(123)
    expect(mobileWorkspaceHeaderClearance(59, 'identity')).toBe(171)
    expect(mobileWorkspaceHeaderClearance(-20, 'identity')).toBe(112)
  })
})
