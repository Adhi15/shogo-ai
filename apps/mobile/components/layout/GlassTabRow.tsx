// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Shogo Technologies, Inc.

/**
 * The bottom tab pill. The selection is one glass capsule that slides between
 * tabs on a spring and can be dragged: put a finger on the bar and the capsule
 * follows it, ticking a haptic as it crosses each tab, then settles (carrying
 * the flick's momentum) on the tab it would coast to and opens it.
 *
 * Drag tracking uses raw touch events on the pill rather than a PanResponder:
 * the tab buttons are Pressables that already hold the touch, and an ancestor
 * PanResponder is never asked to take it over. Taps are left to the buttons;
 * a release that ends a drag suppresses the button press it would also fire.
 */
import type React from "react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentType,
} from "react";
import {
  Animated,
  Pressable,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from "react-native";
import { GlassContainer, GlassView } from "expo-glass-effect";
import { cn } from "@shogo/shared-ui/primitives";
import { LiquidGlassBackdrop, nativeLiquidGlass } from "../ui/LiquidGlassBackdrop";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { haptics } from "../../lib/haptics";
import { SPRING } from "../../lib/motion";
import {
  capsuleXForFinger,
  createNavigationGate,
  isTabDrag,
  settleTabIndex,
  tabIndexAtX,
  type TabSlot,
} from "../../lib/tab-bar-drag";

export interface GlassTabItem {
  id: string;
  label: string;
  Icon: ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  onPress: () => void;
}

interface GlassTabRowProps {
  items: GlassTabItem[];
  /** The id of the selected tab, or anything else for none. */
  active: string;
  /** Show placeholders instead of tabs while the workspace experience loads. */
  loading?: boolean;
  height: number;
  /** Gap between the pill's edge and the selection capsule (top and bottom). */
  itemInset: number;
  maxWidth?: number;
  isDark: boolean;
}

const ICON = {
  selected: { dark: "#F09050", light: "#E27927" },
  idle: { dark: "#a1a1aa", light: "#6b7280" },
} as const;
// Light enough that the glass, not the tint, carries the surface: a heavy white
// tint over a white page reads as a solid pill.
const PILL_TINT = {
  dark: "rgba(28,28,30,0.2)",
  light: "rgba(255,255,255,0.1)",
} as const;
/**
 * How close glass shapes in the container must be to blend into one another.
 * The capsule always sits inside the pill, so this only shapes how the two
 * glass surfaces melt together at the capsule's edge.
 */
const GLASS_MERGE_SPACING = 24;
/** Drag speed (px/s) at which the capsule is stretched to its limit. */
const STRETCH_FULL_SPEED = 2600;
/** Extra width the capsule gains at full stretch (0.3 = 30%). */
const STRETCH_AMOUNT = 0.3;
const CAPSULE_TINT = {
  dark: "rgba(240,144,80,0.32)",
  light: "rgba(226,121,39,0.22)",
} as const;
/** Fingertip samples kept to estimate the release velocity. */
const SAMPLE_COUNT = 6;
/** How long after a drag ends a button press is ignored. */
const SUPPRESS_PRESS_MS = 300;
/**
 * Minimum gap between navigations, about one screen transition. A tap that
 * lands mid-transition would overlap a second transition on top of it, and
 * iOS then falls back to its default dimming (a grey flash across the page).
 */
const NAV_GAP_MS = 360;

export function GlassTabRow({
  items,
  active,
  loading = false,
  height,
  itemInset,
  maxWidth,
  isDark,
}: GlassTabRowProps) {
  const reducedMotion = useReducedMotion();
  const scheme = isDark ? "dark" : "light";
  const itemHeight = height - itemInset * 2;

  const rowRef = useRef<View>(null);
  /** The pill's left edge in window coordinates, to turn a touch's pageX into pill coordinates. */
  const originX = useRef(0);
  const [slots, setSlots] = useState<(TabSlot | undefined)[]>([]);
  const slotsRef = useRef<TabSlot[]>([]);
  const ready = slots.length === items.length && slots.every(Boolean);

  const capsuleX = useRef(new Animated.Value(0)).current;
  const lift = useRef(new Animated.Value(0)).current;
  // 0..1: how much the capsule is stretched along its travel, from drag speed.
  const stretch = useRef(new Animated.Value(0)).current;
  const placed = useRef(false);

  const activeIndex = items.findIndex((item) => item.id === active);
  const activeIndexRef = useRef(activeIndex);
  activeIndexRef.current = activeIndex;
  // While a finger is down the highlighted tab is the one under it.
  const [hovered, setHovered] = useState<number | null>(null);
  const hoveredRef = useRef<number | null>(null);
  const selectedIndex = hovered ?? activeIndex;

  const touch = useRef<{
    x0: number;
    y0: number;
    dragging: boolean;
    samples: { x: number; t: number }[];
  } | null>(null);
  const suppressPressUntil = useRef(0);

  // Navigate at most once per transition. The capsule still moves at once;
  // only the newest request waits its turn, so a burst of taps ends on the
  // last tab instead of stacking transitions on top of each other.
  const navigationGate = useRef(createNavigationGate(NAV_GAP_MS)).current;
  const runNavigation = navigationGate.run;
  useEffect(() => navigationGate.cancel, [navigationGate]);

  const springCapsuleTo = useCallback(
    (toValue: number, velocity = 0) => {
      if (reducedMotion) {
        capsuleX.stopAnimation();
        capsuleX.setValue(toValue);
        return;
      }
      Animated.spring(capsuleX, {
        toValue,
        velocity,
        ...SPRING.snappy,
        // Points, not 0..1 progress: rest within a fraction of a point.
        restDisplacementThreshold: 0.2,
        restSpeedThreshold: 0.5,
        useNativeDriver: true,
      }).start();
    },
    [capsuleX, reducedMotion],
  );

  const liftTo = useCallback(
    (toValue: 0 | 1) => {
      if (reducedMotion) return;
      Animated.spring(lift, {
        toValue,
        ...SPRING.snappy,
        useNativeDriver: true,
      }).start();
    },
    [lift, reducedMotion],
  );

  // Keep the capsule on the active tab whenever the route (not a finger) moves it.
  useEffect(() => {
    if (!ready || activeIndex < 0 || touch.current?.dragging) return;
    const slot = slots[activeIndex]!;
    if (!placed.current) {
      placed.current = true;
      capsuleX.setValue(slot.x);
      return;
    }
    springCapsuleTo(slot.x);
  }, [activeIndex, capsuleX, ready, slots, springCapsuleTo]);

  const onItemLayout = (index: number) => (event: LayoutChangeEvent) => {
    const { x, width } = event.nativeEvent.layout;
    setSlots((prev) => {
      const current = prev[index];
      if (current && current.x === x && current.width === width) return prev;
      const next = prev.slice();
      next[index] = { x, width };
      slotsRef.current = next.filter(Boolean) as TabSlot[];
      return next;
    });
  };

  const measureOrigin = () => {
    rowRef.current?.measureInWindow((windowX) => {
      originX.current = windowX;
    });
  };

  const onTouchStart = (event: GestureResponderEvent) => {
    const { pageX, pageY, timestamp, touches } = event.nativeEvent;
    measureOrigin();
    touch.current =
      touches.length === 1
        ? { x0: pageX, y0: pageY, dragging: false, samples: [{ x: pageX, t: timestamp }] }
        : null;
    liftTo(1);
  };

  const onTouchMove = (event: GestureResponderEvent) => {
    const state = touch.current;
    if (!state || !ready) return;
    const { pageX, pageY, timestamp } = event.nativeEvent;
    state.samples.push({ x: pageX, t: timestamp });
    if (state.samples.length > SAMPLE_COUNT) state.samples.shift();
    if (!state.dragging) {
      if (!isTabDrag(pageX - state.x0, pageY - state.y0)) return;
      state.dragging = true;
    }
    const fingerX = pageX - originX.current;
    capsuleX.setValue(capsuleXForFinger(fingerX, slotsRef.current));
    if (!reducedMotion && state.samples.length > 1) {
      const a = state.samples[0];
      const b = state.samples[state.samples.length - 1];
      const dt = b.t - a.t;
      const speed = dt > 0 ? (Math.abs(b.x - a.x) / dt) * 1000 : 0;
      stretch.setValue(Math.min(1, speed / STRETCH_FULL_SPEED));
    }
    const index = tabIndexAtX(fingerX, slotsRef.current);
    if (index !== hoveredRef.current) {
      hoveredRef.current = index;
      setHovered(index);
      haptics.selection();
    }
  };

  const endTouch = (cancelled: boolean) => {
    const state = touch.current;
    touch.current = null;
    liftTo(0);
    if (!reducedMotion) {
      Animated.spring(stretch, {
        toValue: 0,
        ...SPRING.bouncy,
        useNativeDriver: true,
      }).start();
    }
    if (!state?.dragging) return;
    const first = state.samples[0];
    const last = state.samples[state.samples.length - 1];
    const elapsed = last.t - first.t;
    // px/ms -> px/s, as `Animated.spring` wants.
    const velocity = elapsed > 0 ? ((last.x - first.x) / elapsed) * 1000 : 0;
    const currentX = capsuleXForFinger(last.x - originX.current, slotsRef.current);
    const target = cancelled
      ? Math.max(0, activeIndexRef.current)
      : settleTabIndex(currentX, velocity, slotsRef.current);
    hoveredRef.current = null;
    setHovered(null);
    // The release that ends a drag must not also press the button under it.
    suppressPressUntil.current = Date.now() + SUPPRESS_PRESS_MS;
    springCapsuleTo(slotsRef.current[target].x, velocity);
    if (target !== activeIndexRef.current) runNavigation(items[target].onPress);
  };

  const onItemPress = (index: number) => {
    if (Date.now() < suppressPressUntil.current) return;
    const slot = slotsRef.current[index];
    if (index !== activeIndexRef.current && slot) {
      haptics.selection();
      springCapsuleTo(slot.x);
      // If the press didn't change the selected tab (e.g. it opened a sheet),
      // bring the capsule back to where the route says it is.
      setTimeout(() => {
        const current = activeIndexRef.current;
        if (current !== index && current >= 0 && slotsRef.current[current]) {
          springCapsuleTo(slotsRef.current[current].x);
        }
      }, NAV_GAP_MS * 3);
    }
    runNavigation(items[index].onPress);
  };

  const showCapsule = ready && (activeIndex >= 0 || hovered !== null);
  const capsuleWidth = slots[0]?.width ?? 0;
  const capsuleRadius = itemHeight / 2;

  return (
    <View
      ref={rowRef}
      onLayout={measureOrigin}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={() => endTouch(false)}
      onTouchCancel={() => endTouch(true)}
      className="w-full flex-row items-center gap-1 bg-transparent px-1.5 shadow-sm"
      style={{
        height,
        maxWidth,
        alignSelf: "center",
        borderRadius: height / 2,
      }}
    >
      <GlassLayer native={nativeLiquidGlass()}>
        <LiquidGlassBackdrop
          glassStyle="regular"
          tintColor={PILL_TINT[scheme]}
          style={{ borderRadius: height / 2 }}
        />
        {showCapsule ? (
          <Animated.View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: itemInset,
              left: 0,
              width: capsuleWidth,
              height: itemHeight,
              borderRadius: capsuleRadius,
              transform: [
                { translateX: capsuleX },
                {
                  scaleX: stretch.interpolate({
                    inputRange: [0, 1],
                    outputRange: [1, 1 + STRETCH_AMOUNT],
                  }),
                },
                { scale: lift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) },
              ],
            }}
          >
            {nativeLiquidGlass() ? (
              <GlassView
                isInteractive
                glassEffectStyle="regular"
                colorScheme={scheme}
                tintColor={CAPSULE_TINT[scheme]}
                style={[StyleSheet.absoluteFill, { borderRadius: capsuleRadius }]}
              />
            ) : (
              <View
                className="flex-1 rounded-full bg-primary/10"
                style={{ borderRadius: capsuleRadius }}
              />
            )}
          </Animated.View>
        ) : null}
      </GlassLayer>
      {loading
        ? Array.from({ length: 4 }, (_, index) => (
            <View
              key={index}
              className="flex-1 items-center justify-center"
              style={{ height: itemHeight }}
            >
              <View className="h-6 w-6 rounded-full bg-muted" />
            </View>
          ))
        : items.map(({ id, label, Icon }, index) => {
            const selected = selectedIndex === index;
            return (
              <Pressable
                key={id}
                onPress={() => onItemPress(index)}
                onLayout={onItemLayout(index)}
                accessibilityRole="tab"
                accessibilityLabel={label}
                aria-selected={selected}
                className={cn("flex-1 items-center justify-center rounded-full")}
                style={{ height: itemHeight }}
              >
                <Icon
                  size={23}
                  color={selected ? ICON.selected[scheme] : ICON.idle[scheme]}
                  strokeWidth={selected ? 2.2 : 1.9}
                />
              </Pressable>
            );
          })}
    </View>
  );
}

/**
 * The glass surfaces (pill backdrop and selection capsule), kept below the tab
 * icons. On iOS 26 they share one `GlassContainer`, so the capsule's glass
 * blends into the pill's instead of sitting on top of it as a separate sheet.
 * Elsewhere it is just a pass-through layer.
 */
function GlassLayer({ native, children }: { native: boolean; children: React.ReactNode }) {
  if (native) {
    return (
      <GlassContainer
        pointerEvents="none"
        spacing={GLASS_MERGE_SPACING}
        style={StyleSheet.absoluteFill}
      >
        {children}
      </GlassContainer>
    );
  }
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {children}
    </View>
  );
}
