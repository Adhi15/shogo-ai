// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Shogo Technologies, Inc.
/**
 * Regression coverage for a "click to close never closes" bug: `DockPanel`
 * used to wrap its collapsible body in `@legendapp/motion`'s
 * `AnimatePresence` + a fade `Motion.View` purely for a mount/unmount fade.
 * `onToggle` fired correctly on every click (proven here by a click
 * counter) and React state flipped correctly — but the *exit* animation
 * that was supposed to unmount the body on collapse could get interrupted
 * or never settle (observed in real @legendapp/motion + react-native-web,
 * not just this test's mocks), leaving the body permanently stuck
 * mounted/visible. Once "stuck", no further click could ever close it
 * again, because from the DOM's perspective the panel already looked
 * expanded — only switching chats (remounting `ChatDock` with a fresh
 * store) or a full refresh cleared it.
 *
 * Fixed by dropping the animated exit entirely: the body now mounts/
 * unmounts in the exact same render pass as `expanded` flips (a plain
 * `{expanded && <View>...}`), matching the *already-documented* intent at
 * the top of this file ("Body content mounts/unmounts... rather than
 * animating"). No exit animation means no way for it to get stuck exiting.
 *
 * Uses the REAL `react-native-web` renderer (not the lightweight
 * `test/react-native-mock.ts` passthrough), because the bug only
 * reproduced against `Pressable`'s actual web behavior — the shimmed mock
 * doesn't wire `onPress` to a DOM event at all.
 */
import { describe, expect, mock, test } from "bun:test"
import { render, screen, fireEvent } from "@testing-library/react"
import * as React from "react"
import * as ReactNativeWeb from "react-native-web"

mock.module("react-native", () => ReactNativeWeb)
mock.module("@shogo/shared-ui/primitives", () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}))

const { DockPanel } = await import("../DockPanel")

function DummyIcon() {
  return null
}

function ControlledHarness({ onToggle }: { onToggle: () => void }) {
  const [expanded, setExpanded] = React.useState(false)
  return (
    <DockPanel
      title="Context usage"
      icon={DummyIcon}
      expanded={expanded}
      collapsible
      onToggle={() => {
        onToggle()
        setExpanded((e) => !e)
      }}
    >
      <span>1% Full breakdown body</span>
    </DockPanel>
  )
}

describe("DockPanel", () => {
  test("repeated header clicks toggle the body open/closed synchronously, every time", () => {
    let toggleCalls = 0
    render(<ControlledHarness onToggle={() => toggleCalls++} />)
    const header = screen.getByLabelText("Context usage")

    expect(screen.queryByText("1% Full breakdown body")).toBeNull()

    fireEvent.click(header)
    expect(toggleCalls).toBe(1)
    expect(screen.queryByText("1% Full breakdown body")).not.toBeNull()

    // This is the click that used to never close the panel.
    fireEvent.click(header)
    expect(toggleCalls).toBe(2)
    expect(screen.queryByText("1% Full breakdown body")).toBeNull()

    // And it should keep working indefinitely, not just once.
    fireEvent.click(header)
    expect(screen.queryByText("1% Full breakdown body")).not.toBeNull()
    fireEvent.click(header)
    expect(screen.queryByText("1% Full breakdown body")).toBeNull()
  })

  test("non-collapsible (blocking) panels ignore header clicks and render no chevron", () => {
    render(
      <DockPanel
        title="Waiting for approval"
        icon={DummyIcon}
        expanded
        collapsible={false}
        onToggle={() => {
          throw new Error("onToggle must not fire for a non-collapsible panel")
        }}
      >
        <span>Approve or deny this action</span>
      </DockPanel>,
    )

    fireEvent.click(screen.getByLabelText("Waiting for approval"))
    expect(screen.queryByText("Approve or deny this action")).not.toBeNull()
  })
})
