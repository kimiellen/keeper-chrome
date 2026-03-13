<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { useAuthStore } from '../../stores/auth';
import { useSettingsStore } from '../../stores/settings';
import type { Bookmark } from '../../api/types';

import UnlockView from './views/Unlock.vue';
import MainView from './views/Main.vue';
import BookmarkEditView from './views/BookmarkEdit.vue';
import SettingsView from './views/Settings.vue';

type ViewName = 'unlock' | 'main' | 'edit' | 'settings';
const authStore = useAuthStore();
const settingsStore = useSettingsStore();

const currentView = ref<ViewName | null>(null);
const editingBookmark = ref<Bookmark | null>(null);

let sessionCheckInterval: ReturnType<typeof setInterval> | null = null;
let unlockTimestamp = 0;

function startSessionCheck(): void {
  stopSessionCheck();
  unlockTimestamp = Date.now();
  sessionCheckInterval = setInterval(async () => {
    if (!authStore.locked) {
      const elapsed = Date.now() - unlockTimestamp;
      const timeoutMs = settingsStore.settings.sessionTimeout * 60 * 1000;
      if (elapsed >= timeoutMs) {
        await authStore.lock();
      }
    }
  }, 60 * 1000);
}

function stopSessionCheck(): void {
  if (sessionCheckInterval !== null) {
    clearInterval(sessionCheckInterval);
    sessionCheckInterval = null;
  }
}

onMounted(async () => {
  settingsStore.initTheme();

  try {
    await authStore.checkStatus();
    if (!authStore.locked) {
      currentView.value = 'main';
      startSessionCheck();
    } else {
      currentView.value = 'unlock';
    }
  } catch {
    currentView.value = 'unlock';
  }
});

onUnmounted(() => {
  stopSessionCheck();
});

watch(
  () => authStore.locked,
  (locked) => {
    if (locked) {
      currentView.value = 'unlock';
      stopSessionCheck();
    }
  }
);

watch(
  () => settingsStore.settings.sessionTimeout,
  () => {
    if (!authStore.locked) {
      startSessionCheck();
    }
  }
);

function onUnlocked() {
  currentView.value = 'main';
  startSessionCheck();
}

function onEdit(bookmark: Bookmark | null) {
  editingBookmark.value = bookmark;
  currentView.value = 'edit';
}

function onEditSaved() {
  currentView.value = 'main';
}

function onEditCancel() {
  currentView.value = 'main';
}

function goSettings() {
  currentView.value = 'settings';
}

function goBack() {
  currentView.value = 'main';
}
</script>

<template>
  <div class="keeper-app">
    <UnlockView
      v-if="currentView === 'unlock'"
      @unlocked="onUnlocked"
    />
    <MainView
      v-else-if="currentView === 'main'"
      @edit="onEdit"
      @settings="goSettings"
    />
    <BookmarkEditView
      v-else-if="currentView === 'edit'"
      :bookmark="editingBookmark"
      @saved="onEditSaved"
      @cancel="onEditCancel"
    />
    <SettingsView
      v-else-if="currentView === 'settings'"
      @back="goBack"
    />
  </div>
</template>

<style>
/* CSS 变量 - 亮色主题 */
:root {
  --color-bg: #ffffff;
  --color-bg-secondary: #f9f9f9;
  --color-bg-tertiary: #f5f5f5;
  --color-bg-hover: #f0f0f0;
  --color-text-primary: #333333;
  --color-text-secondary: #666666;
  --color-text-tertiary: #999999;
  --color-text-hint: #bbbbbb;
  --color-border: #eeeeee;
  --color-border-strong: #dddddd;
  --color-accent: #e74c3c;
  --color-accent-hover: #c0392b;
  --color-accent-soft: #fff0f0;
  --color-input-bg: #ffffff;
}

/* CSS 变量 - 暗色主题 */
.dark {
  --color-bg: #1a1a1a;
  --color-bg-secondary: #252525;
  --color-bg-tertiary: #333333;
  --color-bg-hover: #383838;
  --color-text-primary: #eeeeee;
  --color-text-secondary: #cccccc;
  --color-text-tertiary: #888888;
  --color-text-hint: #666666;
  --color-border: #333333;
  --color-border-strong: #444444;
  --color-accent: #e74c3c;
  --color-accent-hover: #ff5a4a;
  --color-accent-soft: #3d2020;
  --color-input-bg: #333333;
}

/* 全局重置 */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  width: 100%;
  min-height: 100vh;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
  background: var(--color-bg);
  color: var(--color-text-primary);
  transition: background 0.2s, color 0.2s;
}

.keeper-app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  min-height: 520px;
  background: var(--color-bg);
}
</style>
