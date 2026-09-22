// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Shogo Technologies, Inc.

import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { ChevronDown, Sparkles } from "lucide-react-native";
import {
  useDomainActions,
  useProjectCollection,
} from "@shogo/shared-app/domain";
import { cn } from "@shogo/shared-ui/primitives";
import { useAuth } from "../../contexts/auth";
import { useDomainHttp } from "../../contexts/domain";
import { useActiveWorkspace } from "../../hooks/useActiveWorkspace";
import { api } from "../../lib/api";
import { TechStackPicker } from "../chat/TechStackPicker";

const DEFAULT_TECH_STACK_ID = "react-app";

function nameFromPrompt(prompt: string): string {
  const words = prompt
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .trim()
    .split(/\s+/)
    .slice(0, 5);
  if (!words.length) return "New Project";
  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
    .slice(0, 56);
}

export function ProjectCreationSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const { user } = useAuth();
  const workspace = useActiveWorkspace();
  const actions = useDomainActions();
  const projects = useProjectCollection();
  const http = useDomainHttp();
  const [name, setName] = useState("New Project");
  const [prompt, setPrompt] = useState("");
  const [techStackId, setTechStackId] = useState(DEFAULT_TECH_STACK_ID);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [nameEdited, setNameEdited] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const phoneSheet = width < 640;

  useEffect(() => {
    if (visible || creating) return;
    setName("New Project");
    setPrompt("");
    setTechStackId(DEFAULT_TECH_STACK_ID);
    setAdvancedOpen(false);
    setNameEdited(false);
    setError(null);
  }, [creating, visible]);

  const resetAndClose = () => {
    if (creating) return;
    setName("New Project");
    setPrompt("");
    setTechStackId(DEFAULT_TECH_STACK_ID);
    setAdvancedOpen(false);
    setNameEdited(false);
    setError(null);
    onClose();
  };

  const updatePrompt = (nextPrompt: string) => {
    setPrompt(nextPrompt);
    if (!nameEdited) setName(nameFromPrompt(nextPrompt));
  };

  const createProject = async (initialMessage?: string) => {
    const trimmedName = name.trim();
    if (!trimmedName || !workspace?.id || !user?.id || creating) return;

    setCreating(true);
    setError(null);
    try {
      const project = await actions.createProject(
        trimmedName,
        workspace.id,
        initialMessage?.trim() || undefined,
        user.id,
        techStackId
      );
      const chat = await api.createWorkspaceSession(http, workspace.id, {
        inferredName: trimmedName,
        attachProjectIds: [project.id],
        attachMode: "readwrite",
      });
      if (!chat?.id) throw new Error("Could not create the project chat.");

      void projects
        .loadAll({ workspaceId: workspace.id })
        .catch(() => undefined);
      void api.prewarmWorkspaceRuntime(http, workspace.id, {
        sessionId: chat.id,
        attachProjectIds: [project.id],
      });
      onClose();
      router.replace({
        pathname: "/(app)/project-chat/[id]",
        params: {
          id: project.id,
          chatSessionId: chat.id,
          chatScope: "workspace",
          ...(initialMessage?.trim()
            ? { initialMessage: initialMessage.trim() }
            : {}),
        },
      } as any);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not create the project."
      );
    } finally {
      setCreating(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType={phoneSheet ? "slide" : "fade"}
      onRequestClose={resetAndClose}
    >
      <View
        className={
          phoneSheet
            ? "flex-1 justify-end"
            : "flex-1 items-center justify-center bg-black/45 p-6"
        }
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cancel project creation"
          onPress={resetAndClose}
          className="absolute inset-0"
        />
        <View
          className={
            phoneSheet
              ? "overflow-hidden rounded-t-[28px] bg-card"
              : "w-full max-w-[520px] overflow-hidden rounded-2xl bg-card"
          }
          style={{
            maxHeight: phoneSheet
              ? Math.round(height * 0.88)
              : Math.min(height - 96, 720),
          }}
        >
          {phoneSheet ? (
            <View className="items-center pb-2 pt-3">
              <View className="h-1 w-9 rounded-full bg-muted-foreground/30" />
            </View>
          ) : null}
          <ScrollView
            contentContainerClassName="px-6 pb-6 pt-5"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View className="flex-row items-center gap-2">
              <View className="h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                <Sparkles size={17} className="text-primary" />
              </View>
              <Text className="text-lg font-semibold text-foreground">
                Create project
              </Text>
            </View>
            <Text className="mt-2 text-sm leading-5 text-muted-foreground">
              Describe what you want to build. Shogo will use it to start the
              project chat.
            </Text>

            <Text className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Project name
            </Text>
            <TextInput
              value={name}
              onChangeText={(nextName) => {
                setNameEdited(true);
                setName(nextName);
              }}
              placeholder="New Project"
              placeholderTextColor="#8a8a8f"
              className="rounded-xl border border-border bg-background px-3 py-3 text-sm text-foreground web:outline-none"
              style={{ outlineWidth: 0, outlineStyle: "none" } as any}
              editable={!creating}
            />

            <Text className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              What are we building?
            </Text>
            <TextInput
              value={prompt}
              onChangeText={updatePrompt}
              placeholder="Build a project to…"
              placeholderTextColor="#8a8a8f"
              multiline
              textAlignVertical="top"
              className="min-h-[112px] rounded-xl border border-border bg-background px-3 py-3 text-sm leading-5 text-foreground web:outline-none"
              style={{ outlineWidth: 0, outlineStyle: "none" } as any}
              editable={!creating}
            />

            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: advancedOpen }}
              accessibilityLabel="Toggle advanced project options"
              onPress={() => setAdvancedOpen((open) => !open)}
              className="mt-4 flex-row items-center gap-2 py-2"
            >
              <Text className="flex-1 text-sm font-medium text-foreground">
                Advanced
              </Text>
              <View className={cn(advancedOpen && "rotate-180")}>
                <ChevronDown size={17} className="text-muted-foreground" />
              </View>
            </Pressable>
            {advancedOpen ? (
              <View className="mt-2 overflow-hidden rounded-xl border border-border">
                <ScrollView
                  style={{ maxHeight: 260 }}
                  nestedScrollEnabled
                  showsVerticalScrollIndicator
                  keyboardShouldPersistTaps="handled"
                >
                  <TechStackPicker
                    presentation="list"
                    value={techStackId}
                    onChange={setTechStackId}
                    disabled={creating}
                  />
                </ScrollView>
              </View>
            ) : null}

            {error ? (
              <Text className="mt-3 text-sm text-destructive">{error}</Text>
            ) : null}

            <View className="mt-6 flex-row items-center justify-end gap-3">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cancel project creation"
                onPress={resetAndClose}
                disabled={creating}
                className="rounded-lg px-3 py-2.5 active:bg-muted disabled:opacity-50"
              >
                <Text className="text-sm font-medium text-muted-foreground">
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Create blank project"
                onPress={() => void createProject()}
                disabled={creating || !name.trim()}
                className="rounded-lg px-3 py-2.5 active:bg-muted disabled:opacity-50"
              >
                <Text className="text-sm font-medium text-foreground">
                  Blank project
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Create project and start chat"
                onPress={() => void createProject(prompt)}
                disabled={creating || !name.trim()}
                className="min-w-[132px] items-center rounded-lg bg-primary px-4 py-2.5 disabled:opacity-50"
              >
                {creating ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text className="text-sm font-semibold text-primary-foreground">
                    Create & chat
                  </Text>
                )}
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
