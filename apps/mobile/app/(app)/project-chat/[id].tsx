// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Shogo Technologies, Inc.

import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { observer } from "mobx-react-lite";
import { useAuth } from "../../../contexts/auth";
import { useDomainActions } from "@shogo/shared-app/domain";
import { useDomainHttp } from "../../../contexts/domain";
import { useActiveWorkspace } from "../../../hooks/useActiveWorkspace";
import { useWorkspaceExperience } from "../../../hooks/useWorkspaceExperience";
import { ChatPanel } from "../../../components/chat/ChatPanel";
import { api } from "../../../lib/api";
import { isWorkspaceRuntimeEnabled } from "../../../lib/platform-config";

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default observer(function ProjectChatScreen() {
  const params = useLocalSearchParams<{
    id?: string | string[];
    chatSessionId?: string | string[];
    newChatNonce?: string | string[];
    initialMessage?: string | string[];
    chatScope?: string | string[];
  }>();
  const projectId = firstParam(params.id);
  const requestedSessionId = firstParam(params.chatSessionId);
  const newChatNonce = firstParam(params.newChatNonce);
  const initialMessage = firstParam(params.initialMessage);
  const requestedChatScope =
    firstParam(params.chatScope) === "workspace" ? "workspace" : "project";
  const { user } = useAuth();
  const workspace = useActiveWorkspace();
  const experience = useWorkspaceExperience();
  const actions = useDomainActions();
  const http = useDomainHttp();
  const [chatSessionId, setChatSessionId] = useState<string | null>(
    requestedSessionId ?? null
  );
  const [chatScope, setChatScope] = useState<"project" | "workspace">(
    requestedChatScope
  );

  useEffect(() => {
    setChatSessionId(requestedSessionId ?? null);
    setChatScope(requestedChatScope);
  }, [requestedChatScope, requestedSessionId]);

  useEffect(() => {
    if (newChatNonce) setChatSessionId(null);
  }, [newChatNonce]);

  useEffect(() => {
    if (!projectId || (requestedSessionId && !newChatNonce) || chatSessionId)
      return;
    let cancelled = false;
    const createSession =
      isWorkspaceRuntimeEnabled() && workspace?.id
        ? api
            .createWorkspaceSession(http, workspace.id, {
              inferredName: "Untitled",
              attachProjectIds: [projectId],
              attachMode: "readwrite",
            })
            .then((session) => {
              void api.prewarmWorkspaceRuntime(http, workspace.id, {
                sessionId: session.id,
                attachProjectIds: [projectId],
              });
              setChatScope("workspace");
              return session;
            })
        : actions.createChatSession({
            inferredName: "Untitled",
            contextType: "project",
            contextId: projectId,
          });
    void createSession
      .then((session) => {
        if (!cancelled && session?.id) setChatSessionId(session.id);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [
    actions,
    chatSessionId,
    http,
    newChatNonce,
    projectId,
    requestedSessionId,
    workspace?.id,
  ]);

  if (!projectId) return null;

  if (!chatSessionId) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View className="min-h-0 flex-1 bg-background">
      <ChatPanel
        featureId={projectId}
        featureName="Project chat"
        phase={null}
        workspaceId={workspace?.id}
        userId={user?.id}
        projectId={projectId}
        chatScope={chatScope}
        chatSessionId={chatSessionId}
        initialMessage={initialMessage}
        onChatSessionChange={setChatSessionId}
        composer={experience.composer}
        presentation="agent"
        className="flex-1"
        isActive
      />
    </View>
  );
});
