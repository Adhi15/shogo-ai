// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Shogo Technologies, Inc.

export type MobileWorkspaceHeaderVariant = 'chrome' | 'identity'

/** Menu/bell controls plus a small gap before transcript content. */
export const MOBILE_WORKSPACE_CHROME_HEIGHT = 64
/** Avatar, name, status, and menu/bell controls plus a gap before content. */
export const MOBILE_WORKSPACE_IDENTITY_HEADER_HEIGHT = 112

/**
 * Reserves the same header space for browser, iOS, and Android. Safe-area
 * insets are OS-owned; the product chrome beneath them stays identical.
 */
export function mobileWorkspaceHeaderClearance(
  topInset: number,
  variant: MobileWorkspaceHeaderVariant,
): number {
  const productHeight =
    variant === "identity"
      ? MOBILE_WORKSPACE_IDENTITY_HEADER_HEIGHT
      : MOBILE_WORKSPACE_CHROME_HEIGHT
  return Math.max(0, topInset) + productHeight
}
