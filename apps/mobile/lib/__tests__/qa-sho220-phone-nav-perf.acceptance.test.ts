// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Shogo Technologies, Inc.
/**
 * SHO-220 acceptance guard (QA round 1).
 *
 * Four properties of the phone work that are cheap to state and expensive to
 * lose, and that no rtl test covers because the surfaces involved are a route
 * layout, a header slot and a pure reducer:
 *
 * 1. **Back is wired on web as well as native.** `ProjectTopBar` renders
 *    `NativePhoneHeader` on `isPhoneLayout(width)`, which on web is simply
 *    `width <= 767` — so a narrow web viewport paints the same arrow, and a
 *    handler gated on `Platform.OS !== "web"` is a dead control on the surface
 *    Russell named ("phone / phone web"). Wide web and desktop never render it,
 *    so one handler for every platform is correct.
 * 2. **The workspace avatar is Home's only sidebar button.** No other screen
 *    passes a `leading` control, so nothing else can grow a menu button.
 * 3. **The sidebar sheet is not mounted until the drawer opens.**
 * 4. **The conversation list updates in place**: only the conversation the
 *    event touched gets a new reference, so 150 rows do not re-render on every
 *    message.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { applyListEvent } from '../team-chat-state'
import type { ChatMessage, ConversationSummary } from '../team-chat-api'

const MOBILE = join(import.meta.dir, '../..')
const read = (relative: string) => readFileSync(join(MOBILE, relative), 'utf8')

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '__tests__' || entry === '.expo') continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx$/.test(entry)) out.push(full)
  }
  return out
}

describe('a project is a screen you go into, on every platform', () => {
  const layout = read('app/(app)/projects/[id]/_layout.tsx')

  test('Back is wired on web as well as native', () => {
    // The handler exists…
    expect(layout).toMatch(/onBack:\s*\(\)\s*=>\s*\{/)
    // …pops when there is something to pop…
    expect(layout).toMatch(/router\.canGoBack\(\)/)
    expect(layout).toMatch(/router\.back\(\)/)
    // …and falls back to Home rather than nowhere.
    expect(layout).toContain('/(app)/home')
  })

  test('it is not gated on the platform', () => {
    // The round-1 blocker: `onBack: Platform.OS !== "web" ? … : undefined`.
    expect(layout).not.toMatch(/onBack:\s*\n?\s*Platform\.OS/)
    expect(layout).not.toMatch(/onBack:[\s\S]{0,120}Platform\.OS\s*!==\s*"web"/)
    expect(layout).not.toMatch(/onBack:\s*undefined/)
  })

  test('the header that renders it is chosen by width, not by platform', () => {
    // Why the gate was wrong: this header shows on web too.
    const topbar = read('components/project/ProjectTopBar.tsx')
    expect(topbar).toMatch(/isPhoneLayout\(/)
    expect(topbar).toMatch(/NativePhoneHeader/)
    // And it renders a real arrow, not a hamburger.
    const header = read('components/project/topbar/native/NativePhoneHeader.tsx')
    expect(header).toContain('project-native-back')
    // A back arrow, not a hamburger: the lucide `Menu` icon is gone from it.
    expect(header).toMatch(/icon=\{ArrowLeft\}/)
    expect(header).not.toMatch(/^\s*Menu,$/m)
  })
})

describe("the workspace avatar is Home's only sidebar button", () => {
  test('no screen other than the Home feed passes a `leading` control', () => {
    const files = [
      ...walk(join(MOBILE, 'app')),
      ...walk(join(MOBILE, 'components')),
    ]
    const withLeading = files
      .filter((file) => /\bleading=\{/.test(readFileSync(file, 'utf8')))
      .map((file) => file.slice(MOBILE.length + 1))
      .sort()
    expect(withLeading).toEqual(['components/home/MobileHomeFeed.tsx'])
  })

  test('that control is the avatar, and it opens the workspace switcher, not the drawer', () => {
    const feed = read('components/home/MobileHomeFeed.tsx')
    expect(feed).toMatch(/leading=\{<WorkspaceSidebarAvatar/)
    const avatar = read('components/layout/WorkspaceSidebarAvatar.tsx')
    expect(avatar).toContain('MobileWorkspaceSwitcherSheet')
    expect(avatar).not.toContain('requestOpenSidebar')
    expect(avatar).toContain('home-sidebar-avatar')
  })
})

describe('screens with their own header skip the legacy hamburger header', () => {
  const layout = read('app/(app)/_layout.tsx')

  test('the phone own-chrome list covers the More destinations and Marketplace', () => {
    const list = layout.match(/PHONE_OWN_CHROME_ROUTES = new Set\(\[([\s\S]*?)\]\)/)?.[1] ?? ''
    for (const route of ['analytics', 'work', 'social', 'marketplace', 'creator']) {
      expect(list).toContain(`"${route}"`)
    }
  })

  test('those screens drop the shared header, and with it the legacy drawer swipe', () => {
    expect(layout).toMatch(/isOwnChromePage \|\|/)
    expect(layout).toMatch(/!suppressNarrowAppHeader/)
  })
})

describe('every More destination has a way back', () => {
  test('each one draws the shared phone back arrow', () => {
    const screens: Record<string, string> = {
      'app/(app)/analytics.tsx': /<TabScreen[^>]*\bback\b/.source,
      'app/(app)/work.tsx': /<PhoneBackButton \/>/.source,
      'app/(app)/social.tsx': /<PhoneBackButton \/>/.source,
      'app/(app)/starred.tsx': /<PhoneBackButton \/>/.source,
      'app/(app)/shared.tsx': /<PhoneBackButton \/>/.source,
      'app/(app)/creator/index.tsx': /<PhoneBackButton \/>/.source,
    }
    for (const [file, pattern] of Object.entries(screens)) {
      expect(read(file), file).toMatch(new RegExp(pattern))
    }
  })
})

describe('project screens stay below the status bar', () => {
  test('the shell does not pad a project page, whose header pads itself', () => {
    expect(read('app/(app)/_layout.tsx')).toMatch(/useMobileWorkspaceShell && !isProjectDetail/)
  })

  test('the full-screen surface route pads itself, the side pane does not', () => {
    const view = read('components/project/ProjectSurfaceView.tsx')
    expect(view).toMatch(/padTopInset \? \{ paddingTop: insets\.top \}/)
    expect(read('app/(app)/project-surface/[id].tsx')).toMatch(/\bpadTopInset\b/)
    expect(read('components/team-chat/ProjectSidePane.tsx')).not.toMatch(/padTopInset/)
  })
})

describe('dock tab screens have no stack back-swipe', () => {
  const layout = read('app/(app)/_layout.tsx')

  test('the back-swipe is off for every tab route and the DMs tab', () => {
    expect(layout).toMatch(
      /gestureEnabled:\s*!PHONE_NO_BACK_SWIPE_SCREENS\.has\(route\.name\)\s*&&\s*!PHONE_TAB_ROUTES\.has\(route\.name\.split\("\/"\)\[0\]\)/,
    )
    expect(layout).toMatch(/PHONE_NO_BACK_SWIPE_SCREENS = new Set\(\["c\/dms"\]\)/)
  })

  test('the tab routes cover Home, More and the project tabs', () => {
    const list = layout.match(/PHONE_TAB_ROUTES = new Set\(\[([\s\S]*?)\]\)/)?.[1] ?? ''
    for (const route of [
      'index', 'agent', 'home', 'more', 'goals', 'meetings', 'activity', 'tasks',
      'canvases', 'project-chat', 'project-surface',
    ]) {
      expect(list).toContain(`"${route}"`)
    }
    // The More destinations ride along through the spread.
    expect(list).toContain('...PHONE_MORE_DESTINATIONS_LIST')
  })
})

describe('the project settings card fits a phone', () => {
  test('the look editor takes the compact layout on a phone and lets the page scroll', () => {
    const sheet = read('components/personal/BuddyLookSheet.tsx')
    expect(sheet).toMatch(/layout \?\? \(isPhone \? "compact" : "full"\)/)
    expect(sheet).toMatch(/<BuddyLookContent[^>]*\binline\b/)
    // No nested scroller: it clipped the last rows inside a page that already scrolls.
    expect(read('components/island/buddy/BuddyCustomizer.tsx')).toMatch(/if \(inline\) return <View>/)
  })

  test('colour swatches sit in fixed rows, not one wrapping list', () => {
    const customizer = read('components/island/buddy/BuddyCustomizer.tsx')
    expect(customizer).toMatch(/swatchesPerRow=\{SWATCHES_PER_ROW\}/)
  })

  test('the settings surface scrolls', () => {
    expect(read('components/project/ProjectSurfaceView.tsx')).toMatch(/<ScrollView[\s\S]*?<ProjectSettingsContent/)
  })
})

describe('the project header lines up on a phone', () => {
  const header = read('components/project/topbar/native/NativePhoneHeader.tsx')

  test('Back and the trailing controls share one edge inset', () => {
    expect(header).toMatch(/NATIVE_HEADER_PAD_X = 16/)
    expect(header).not.toMatch(/NATIVE_HEADER_PAD_LEFT/)
  })

  test('its round buttons and the chat/more pill are liquid glass, like the rest of the chrome', () => {
    expect(read('components/project/topbar/native/NativeCircleButton.tsx')).toMatch(/<LiquidGlassBackdrop/)
    expect(header).toMatch(/project-native-chat-more-cluster[\s\S]*?<LiquidGlassBackdrop/)
    // Buttons inside a sheet stay flat rather than stacking glass on glass.
    expect(header).toMatch(/<NativeCircleButton\s+flat/)
  })

  test('the title takes the space between the controls instead of a symmetric inset', () => {
    expect(header).toMatch(/paddingLeft: titleInsetLeft/)
    expect(header).toMatch(/paddingRight: titleInsetRight/)
  })
})

describe('the Home feed rows share one page gutter', () => {
  const feed = read('components/home/MobileHomeFeed.tsx')

  test('the list pads once and every row takes its inset from that', () => {
    expect(feed).toMatch(/contentContainerClassName="px-1 pb-36"/)
    // The search card, project rows and failed rows sit at the same gutter as channel rows.
    expect(feed).toMatch(/mx-3 mb-3 mt-1/)
    expect(feed).toMatch(/gap-3 rounded-md px-3 py-2/)
    expect(feed).not.toMatch(/rounded-md px-2 py-2/)
  })

  test('the agent cards and the agents panel follow the same gutter on a phone', () => {
    expect(read('components/home/AgentsSection.tsx')).toMatch(/gap-2 px-3 pb-2 pt-2/)
    expect(read('components/home/AgentRowItem.tsx')).not.toMatch(/"px-4 pb-2"/)
    const panel = read('components/team-chat/panels/AgentsPanel.tsx')
    expect(panel).toMatch(/phone \? 'px-1' : 'px-2'/)
    expect(panel).toMatch(/phone \? '-mx-2' : undefined/)
  })
})

describe('the sidebar sheet is not mounted until it is opened', () => {
  test('the phone layout asks for a lazy sheet and the shell honours it', () => {
    const layout = read('app/(app)/_layout.tsx')
    expect(layout).toMatch(/lazySidebarSheet/)
    const shell = read('components/layout/NativeSheetDrawerShell.tsx')
    // The sheet is only mounted when the drawer is open (or laziness is off);
    // it stays through the closing animation so it can slide out.
    expect(shell).toMatch(
      /const sheetMounted = !lazySidebarSheet \|\| drawerOpen \|\| sheetCompositing/,
    )
    expect(shell).toMatch(/sheetMounted \?/)
  })
})

describe('the conversation list updates in place', () => {
  const conversation = (id: string, lastSeq: number): ConversationSummary =>
    ({
      id,
      workspaceId: 'ws-1',
      kind: 'public',
      name: id,
      slug: id,
      topic: null,
      lastSeq,
      lastMessageAt: '2026-10-26T00:00:00.000Z',
      archivedAt: null,
      createdAt: '2026-10-25T00:00:00.000Z',
      joined: true,
      starred: false,
      muted: false,
      notifyLevel: 'all',
      lastReadSeq: lastSeq,
      unreadCount: 0,
      mentionCount: 0,
    }) as ConversationSummary

  const message = (conversationId: string, seq: number): ChatMessage =>
    ({
      id: `m-${conversationId}-${seq}`,
      conversationId,
      workspaceId: 'ws-1',
      seq,
      threadRootId: null,
      replyCount: 0,
      lastReplyAt: null,
      alsoSentToChannel: false,
      authorType: 'user',
      author: { id: 'someone-else', name: 'Someone', image: null },
      authorUserId: 'someone-else',
      authorAgent: null,
      text: 'hello',
      blocks: null,
      clientMsgId: null,
      agentSessionId: null,
      agentStatus: null,
      reactions: [],
      attachments: [],
      editedAt: null,
      deletedAt: null,
      createdAt: '2026-10-26T01:00:00.000Z',
    }) as ChatMessage

  test('only the conversation the event touched gets a new reference', () => {
    const list = [conversation('a', 1), conversation('b', 1), conversation('c', 1)]
    const before = [...list]
    const { list: next } = applyListEvent(
      list,
      { type: 'message.created', conversationId: 'b', message: message('b', 2) },
      'me',
      null,
    )
    // A new array (so React sees a change)…
    expect(next).not.toBe(list)
    // …with the untouched rows keeping their identity (so 150 rows do not redraw).
    expect(next[0]).toBe(before[0])
    expect(next[2]).toBe(before[2])
    expect(next[1]).not.toBe(before[1])
    expect(next[1].id).toBe('b')
    expect(next[1].lastSeq).toBe(2)
    // The original list is not mutated in place.
    expect(list[1]).toBe(before[1])
  })

  test('a quiet event returns the same array, so nothing re-renders', () => {
    const list = [conversation('a', 1), conversation('b', 1)]
    const { list: next } = applyListEvent(
      list,
      { type: 'message.created', conversationId: 'not-in-this-list', message: message('not-in-this-list', 2) },
      'me',
      null,
    )
    // A conversation this client cannot see asks for a refetch and changes nothing.
    expect(next).toBe(list)
  })
})
