// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Shogo Technologies, Inc.
/**
 * Maths for a tab bar whose selection is one glass capsule that follows the
 * finger: which tab is under it, where the capsule may travel, and which tab
 * it settles on after a flick. Pure so it is unit-testable without a device.
 */
import { nearestSnapTarget } from './motion'

/** Horizontal finger travel before a touch on the bar becomes a drag (taps stay taps). */
export const TAB_DRAG_SLOP = 6

/**
 * How far a released capsule coasts. A tab bar is a few hundred points wide,
 * so this is much smaller than UIScrollView's (0.998): about 32pt per
 * 1000pt/s, so a firm flick lands a tab or two further, not at the far end.
 * A starting point to tune on a device.
 */
export const TAB_BAR_DECELERATION = 0.97

export interface TabSlot {
  /** Left edge of the slot, in the bar's own coordinates. */
  x: number
  width: number
}

/** Left edge the capsule takes when it is centred on `fingerX`, held inside the first and last slot. */
export function capsuleXForFinger(fingerX: number, slots: readonly TabSlot[]): number {
  if (slots.length === 0) return 0
  const first = slots[0]
  const last = slots[slots.length - 1]
  const width = first.width
  return Math.min(last.x, Math.max(first.x, fingerX - width / 2))
}

/** Index of the slot whose centre is nearest `fingerX`. */
export function tabIndexAtX(fingerX: number, slots: readonly TabSlot[]): number {
  let best = 0
  let bestDistance = Infinity
  for (let i = 0; i < slots.length; i++) {
    const distance = Math.abs(slots[i].x + slots[i].width / 2 - fingerX)
    if (distance < bestDistance) {
      best = i
      bestDistance = distance
    }
  }
  return best
}

/**
 * Where a released capsule settles: the slot nearest to where it would coast
 * to, given its left edge and release velocity (px per second).
 */
export function settleTabIndex(
  capsuleX: number,
  velocityPxPerSec: number,
  slots: readonly TabSlot[],
): number {
  if (slots.length === 0) return 0
  return nearestSnapTarget(
    capsuleX,
    velocityPxPerSec,
    slots.map((slot) => slot.x),
    TAB_BAR_DECELERATION,
  )
}

/** A touch that has moved far enough sideways to be a drag rather than a tap. */
export function isTabDrag(dx: number, dy: number): boolean {
  return Math.abs(dx) > TAB_DRAG_SLOP && Math.abs(dx) > Math.abs(dy)
}
