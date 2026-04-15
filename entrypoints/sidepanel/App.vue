<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { useAuthStore } from '../../stores/auth';
import { useSettingsStore } from '../../stores/settings';
import { useBookmarksStore } from '../../stores/bookmarks';
import { useTagsStore } from '../../stores/tags';
import { useRelationsStore } from '../../stores/relations';
import type { Bookmark } from '../../api/types';

import UnlockView from './views/Unlock.vue';
import MainView from './views/Main.vue';
import BookmarkEditView from './views/BookmarkEdit.vue';
import SettingsView from './views/Settings.vue';

type ViewName = 'unlock' | 'main' | 'edit' | 'settings';
const authStore = useAuthStore();
const settingsStore = useSettingsStore();
const bookmarksStore = useBookmarksStore();
const tagsStore = useTagsStore();
const relationsStore = useRelationsStore();

const currentView = ref<ViewName | null>(null);
const editingBookmark = ref<Bookmark | null>(null);
const isLoading = ref(true); // 添加加载状态

function handleLockAndHide(message: { type: string }): void {
  if (message.type === 'LOCK_AND_HIDE' && !authStore.locked) {
    void authStore.lock();
  }
}

onMounted(async () => {
  console.log('[Keeper:App] onMounted called');
  isLoading.value = true;
  
  // 先初始化设置
  await settingsStore.init();
  settingsStore.applyTheme();

  try {
    // 检查认证状态
    await authStore.checkStatus();
    console.log('[Keeper:App] auth status:', authStore.locked ? 'locked' : 'unlocked');
    
    if (!authStore.locked) {
      currentView.value = 'main';
      // 加载数据（书签、标签、关系）
      console.log('[Keeper:App] loading data...');
      await Promise.all([
        bookmarksStore.fetchBookmarks(),
        tagsStore.fetchTags(),
        relationsStore.fetchRelations()
      ]);
      console.log('[Keeper:App] data loaded, bookmarks:', bookmarksStore.bookmarks.length);
    } else {
      currentView.value = 'unlock';
    }
  } catch (e) {
    console.error('[Keeper:App] checkStatus error:', e);
    currentView.value = 'unlock';
  } finally {
    isLoading.value = false;
  }

  browser.runtime.onMessage.addListener(handleLockAndHide);
});

onUnmounted(() => {
  browser.runtime.onMessage.removeListener(handleLockAndHide);
});

watch(
  () => authStore.locked,
  (locked) => {
    if (locked && currentView.value !== 'unlock') {
      currentView.value = 'unlock';
    }
  }
);

// 数据获取统一在视图切换回调中处理，不在 watch 中重复处理
// 避免 onUnlocked/onEditSaved/onEditCancel/goBack 和 watch 的重复调用

async function onUnlocked() {
  currentView.value = 'main';
  // 等待 token 完全保存到 storage
  await new Promise(resolve => setTimeout(resolve, 100));
  // 解锁后获取数据
  await Promise.all([
    bookmarksStore.fetchBookmarks(),
    tagsStore.fetchTags(),
    relationsStore.fetchRelations()
  ]);
}

function onEdit(bookmark: Bookmark | null) {
  editingBookmark.value = bookmark;
  currentView.value = 'edit';
}

function onEditSaved() {
  currentView.value = 'main';
  // 保存后刷新数据
  void Promise.all([
    bookmarksStore.fetchBookmarks(),
    tagsStore.fetchTags(),
    relationsStore.fetchRelations()
  ]);
}

function onEditCancel() {
  currentView.value = 'main';
  // 返回主页面时刷新数据
  void Promise.all([
    bookmarksStore.fetchBookmarks(),
    tagsStore.fetchTags(),
    relationsStore.fetchRelations()
  ]);
}

function goSettings() {
  currentView.value = 'settings';
}

function goBack() {
  currentView.value = 'main';
  // 返回主页面时刷新数据
  void Promise.all([
    bookmarksStore.fetchBookmarks(),
    tagsStore.fetchTags(),
    relationsStore.fetchRelations()
  ]);
}
</script>

<template>
  <div class="keeper-app">
    <!-- 加载状态 - 覆盖层 -->
    <div v-if="isLoading" class="loading-screen">
      <div class="loading-spinner"></div>
    </div>
    
    <!-- 视图 - 不使用 Transition，直接渲染 -->
    <div v-show="!isLoading" class="views-wrapper">
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
  position: relative;
}

/* 加载屏幕 - 覆盖层 */
.loading-screen {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg);
  z-index: 100;
}

.loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--color-border);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* 视图容器 - 确保背景色 */
.views-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--color-bg);
}
</style>
