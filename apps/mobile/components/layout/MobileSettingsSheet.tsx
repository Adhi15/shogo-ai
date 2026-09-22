// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Shogo Technologies, Inc.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
} from "react-native";
import {
  ArrowLeft,
  Briefcase,
  ChevronRight,
  Folder,
} from "lucide-react-native";
import { useRouter } from "expo-router";
import {
  SettingsContent,
  WorkspaceAccountActions,
} from "../../app/(app)/settings";
import { ApiKeysPage } from "../../app/(app)/api-keys";
import { CreatorHub } from "../../app/(app)/creator";
import { NewWorkspacePage } from "../../app/(app)/new-workspace";
import { Text } from "../settings/account-sheet-chrome";
import { ProjectSettingsContent } from "../settings/ProjectSettingsContent";
import { usePlatformConfig } from "../../lib/platform-config";
import {
  settingsTab,
  type SettingsTabId,
  visibleSettingsTabs,
} from "../../lib/settings-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { openWebAppSession } from "../../lib/openWebAppSession";

export function MobileSettingsSheet({
  visible,
  onClose,
  projectId,
  openProjectSettings = false,
}: {
  visible: boolean;
  onClose: () => void;
  projectId?: string;
  openProjectSettings?: boolean;
}) {
  const router = useRouter();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { features, localMode } = usePlatformConfig();
  const [activeTab, setActiveTab] = useState<SettingsTabId | null>(null);
  const [projectSettingsOpen, setProjectSettingsOpen] = useState(false);
  const [workspaceActionsOpen, setWorkspaceActionsOpen] = useState(false);
  const [embeddedPage, setEmbeddedPage] = useState<
    "api-keys" | "creator" | "new-workspace" | null
  >(null);
  const leaveSheetThen = useCallback(
    (action: () => void) => {
      onClose();
      setTimeout(action, 0);
    },
    [onClose],
  );
  const openRoute = useCallback(
    (href: any) => leaveSheetThen(() => router.push(href as any)),
    [leaveSheetThen, router],
  );
  const openExternalUrl = useCallback(
    (url: string) =>
      leaveSheetThen(() => {
        void Linking.openURL(url).catch((error) => {
          console.warn("[MobileSettingsSheet] failed to open external URL:", error);
        });
      }),
    [leaveSheetThen],
  );
  const openWebPath = useCallback(
    (path: string) =>
      leaveSheetThen(() => {
        void openWebAppSession(path).catch((error) => {
          console.warn("[MobileSettingsSheet] failed to open web settings:", error);
        });
      }),
    [leaveSheetThen],
  );
  const isLocal = localMode || !features.billing;
  const tabs = useMemo(
    () =>
      visibleSettingsTabs({
        localMode: isLocal,
        showBilling: features.billing,
        platform: Platform.OS,
      }),
    [features.billing, isLocal]
  );

  useEffect(() => {
    if (!visible) {
      setActiveTab(null);
      setProjectSettingsOpen(false);
      setWorkspaceActionsOpen(false);
      setEmbeddedPage(null);
      return;
    }
    setProjectSettingsOpen(openProjectSettings && !!projectId);
  }, [openProjectSettings, projectId, visible]);

  const title = projectSettingsOpen
    ? "Project settings"
    : embeddedPage === "api-keys"
    ? "Devices & API Keys"
    : embeddedPage === "creator"
    ? "Creator studio"
    : embeddedPage === "new-workspace"
    ? "New workspace"
    : workspaceActionsOpen
    ? "Workspace actions"
    : activeTab
    ? settingsTab(activeTab).label
    : "Settings";

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-end">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close settings"
          onPress={onClose}
          className="absolute inset-0"
        />
        <View
          className="max-h-[88%] overflow-hidden rounded-t-[28px] bg-card"
          style={{
            height: Math.round(height * 0.86),
            paddingBottom: Math.max(insets.bottom, 16),
          }}
        >
          <View className="items-center pb-2 pt-3">
            <View className="h-1 w-9 rounded-full bg-muted-foreground/30" />
          </View>
          <View className="flex-row items-center px-6 pb-4 pt-2">
            {activeTab ||
            projectSettingsOpen ||
            workspaceActionsOpen ||
            embeddedPage ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Back to settings"
                onPress={() => {
                  if (embeddedPage) {
                    setEmbeddedPage(null);
                    return;
                  }
                  setActiveTab(null);
                  setProjectSettingsOpen(false);
                  setWorkspaceActionsOpen(false);
                }}
                className="-ml-2 mr-2 h-9 w-9 items-center justify-center rounded-full active:bg-muted"
              >
                <ArrowLeft size={18} className="text-foreground" />
              </Pressable>
            ) : null}
            <Text className="flex-1 text-base font-semibold text-foreground">
              {title}
            </Text>
          </View>

          {embeddedPage ? (
            <View className="flex-1">
              {embeddedPage === "api-keys" ? (
                <ApiKeysPage onBack={() => setEmbeddedPage(null)} />
              ) : embeddedPage === "new-workspace" ? (
                <NewWorkspacePage
                  onBack={() => setEmbeddedPage(null)}
                  onCheckoutComplete={() => openRoute("/(app)")}
                />
              ) : (
                <CreatorHub
                  onBack={() => setEmbeddedPage(null)}
                  onNavigate={openRoute}
                />
              )}
            </View>
          ) : activeTab || projectSettingsOpen || workspaceActionsOpen ? (
            <ScrollView
              className="flex-1"
              contentContainerClassName="px-5 pt-5"
              contentContainerStyle={{
                paddingBottom: Math.max(insets.bottom + 24, 40),
              }}
              showsVerticalScrollIndicator={false}
            >
              {projectSettingsOpen && projectId ? (
                <ProjectSettingsContent projectId={projectId} />
              ) : workspaceActionsOpen ? (
                <WorkspaceAccountActions
                  onSelectTab={setActiveTab}
                  showWorkspace={false}
                  showSignOut={false}
                  showActionsHeading={false}
                  onOpenApiKeys={() => setEmbeddedPage("api-keys")}
                  onOpenCreator={() => setEmbeddedPage("creator")}
                  onOpenNewWorkspace={() => setEmbeddedPage("new-workspace")}
                  onOpenRoute={openRoute}
                  onOpenExternalUrl={openExternalUrl}
                />
              ) : activeTab ? (
                <SettingsContent
                  activeTab={activeTab}
                  localMode={isLocal}
                  onSelectTab={setActiveTab}
                  onOpenApiKeys={() => setEmbeddedPage("api-keys")}
                  onOpenRoute={openRoute}
                  onOpenExternalUrl={openExternalUrl}
                  onOpenWebPath={openWebPath}
                />
              ) : null}
            </ScrollView>
          ) : (
            <ScrollView
              className="flex-1"
              contentContainerClassName="px-6 py-3"
              showsVerticalScrollIndicator={false}
            >
              <WorkspaceAccountActions
                onSelectTab={setActiveTab}
                showActions={false}
                showSignOut={false}
                onOpenNewWorkspace={() => setEmbeddedPage("new-workspace")}
                onOpenRoute={openRoute}
              />
              {projectId ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Open project settings"
                  onPress={() => setProjectSettingsOpen(true)}
                  className="flex-row items-center gap-3 rounded-lg py-4 active:bg-muted/60"
                >
                  <Folder size={19} className="text-primary" />
                  <Text className="flex-1 text-base text-foreground">
                    Project settings
                  </Text>
                  <ChevronRight size={18} className="text-muted-foreground" />
                </Pressable>
              ) : null}
              {tabs.map(({ id, label, Icon }) => (
                <Pressable
                  key={id}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${label} settings`}
                  onPress={() => setActiveTab(id)}
                  className="flex-row items-center gap-3 rounded-lg py-4 active:bg-muted/60"
                >
                  <Icon size={19} className="text-foreground" />
                  <Text className="flex-1 text-base text-foreground">
                    {label}
                  </Text>
                  <ChevronRight size={18} className="text-muted-foreground" />
                </Pressable>
              ))}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open workspace actions"
                onPress={() => setWorkspaceActionsOpen(true)}
                className="flex-row items-center gap-3 rounded-lg py-4 active:bg-muted/60"
              >
                <Briefcase size={19} className="text-foreground" />
                <Text className="flex-1 text-base text-foreground">
                  Workspace actions
                </Text>
                <ChevronRight size={18} className="text-muted-foreground" />
              </Pressable>
              <WorkspaceAccountActions
                onSelectTab={setActiveTab}
                showWorkspace={false}
                showActions={false}
              />
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}
