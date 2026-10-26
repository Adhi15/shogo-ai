// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Shogo Technologies, Inc.
import { describe, expect, test } from 'bun:test'
import { capsuleXForFinger, isTabDrag, settleTabIndex, tabIndexAtX, type TabSlot } from '../tab-bar-drag'

// Five 60pt slots with 4pt gaps starting at 6pt: lefts 6, 70, 134, 198, 262.
const slots: TabSlot[] = Array.from({ length: 5 }, (_, i) => ({ x: 6 + i * 64, width: 60 }))

describe('capsuleXForFinger', () => {
  test('centres the capsule on the finger', () => {
    expect(capsuleXForFinger(164, slots)).toBe(134)
  })

  test('is held inside the first and last slot', () => {
    expect(capsuleXForFinger(-50, slots)).toBe(6)
    expect(capsuleXForFinger(900, slots)).toBe(262)
  })

  test('handles an empty bar', () => {
    expect(capsuleXForFinger(100, [])).toBe(0)
  })
})

describe('tabIndexAtX', () => {
  test('picks the slot whose centre is nearest', () => {
    expect(tabIndexAtX(36, slots)).toBe(0)
    expect(tabIndexAtX(100, slots)).toBe(1)
    expect(tabIndexAtX(166, slots)).toBe(2)
    expect(tabIndexAtX(400, slots)).toBe(4)
    expect(tabIndexAtX(-20, slots)).toBe(0)
  })

  test('the boundary between two tabs belongs to the nearer centre', () => {
    // centres are 36 and 100: midpoint 68
    expect(tabIndexAtX(67, slots)).toBe(0)
    expect(tabIndexAtX(69, slots)).toBe(1)
  })
})

describe('settleTabIndex', () => {
  test('a slow release snaps to the nearest slot', () => {
    expect(settleTabIndex(140, 0, slots)).toBe(2)
    expect(settleTabIndex(100, 0, slots)).toBe(1)
  })

  test('a flick coasts on to the next slot in its direction', () => {
    // resting between slots 1 and 2 (left edge 100) flicked right and left
    expect(settleTabIndex(100, 1500, slots)).toBe(2)
    expect(settleTabIndex(100, -1500, slots)).toBe(1)
    expect(settleTabIndex(70, -3000, slots)).toBe(0)
  })

  test('never leaves the bar', () => {
    expect(settleTabIndex(262, 9000, slots)).toBe(4)
    expect(settleTabIndex(6, -9000, slots)).toBe(0)
  })
})

describe('isTabDrag', () => {
  test('a tap-sized wobble is not a drag', () => {
    expect(isTabDrag(3, 1)).toBe(false)
    expect(isTabDrag(6, 0)).toBe(false)
  })

  test('a clear sideways movement is', () => {
    expect(isTabDrag(12, 2)).toBe(true)
    expect(isTabDrag(-12, 2)).toBe(true)
  })

  test('a vertical-dominant movement is not', () => {
    expect(isTabDrag(8, 14)).toBe(false)
  })
})
