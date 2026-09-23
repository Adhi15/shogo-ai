// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Shogo Technologies, Inc.

module.exports = {
  dependencies: {
    // IAP is intentionally iOS-only in lib/iap.ts. Keeping the Android native
    // module autolinked pulls in the Play Billing flavor and breaks APK builds.
    'react-native-iap': {
      platforms: {
        android: null,
      },
    },
  },
};
