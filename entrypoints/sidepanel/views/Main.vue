<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue';
import { useBookmarksStore } from '../../../stores/bookmarks';
import { useTagsStore } from '../../../stores/tags';
import { useRelationsStore } from '../../../stores/relations';
import { keeperClient } from '../../../api';
import type { Bookmark, UrlItem, AccountItem } from '../../../api/types';
import { ElMessage } from 'element-plus';
import { Search, Plus, Setting, DocumentCopy } from '@element-plus/icons-vue';
import type { ElInput } from 'element-plus';
import { toSoftBackground } from '../../../utils/tagColors';

const emit = defineEmits<{
  (e: 'edit', bookmark: Bookmark | null): void;
  (e: 'settings'): void;
}>();

const bookmarksStore = useBookmarksStore();
const tagsStore = useTagsStore();
const relationsStore = useRelationsStore();

const searchQuery = ref('');
const selectedTagIds = ref<number[]>([]);
const selectedRelationIds = ref<number[]>([]);
const selectedIndex = ref<number | null>(null);
const searchInput = ref<InstanceType<typeof ElInput> | null>(null);
const resultsArea = ref<HTMLElement | null>(null);

// Url Selector Dialog
const urlDialogVisible = ref(false);
const currentUrlBookmark = ref<Bookmark | null>(null);
const currentUrls = ref<UrlItem[]>([]);
const selectedUrlIndex = ref(0);

// Account Selector Dialog
const accountDialogVisible = ref(false);
const currentAccountBookmark = ref<Bookmark | null>(null);
const currentAccounts = ref<AccountItem[]>([]);
const selectedAccountIndex = ref(0);
const accountCopyType = ref<'username'|'password'>('username');

// 过滤后的书签列表
const filteredBookmarks = computed(() => {
  let results = bookmarksStore.bookmarks;
  
  // 空格分隔多关键词 AND 搜索
  if (searchQuery.value.trim()) {
    const keywords = searchQuery.value.trim().split(/\s+/);
    results = results.filter(bookmark => {
      return keywords.every(keyword => {
        const searchText = (
          bookmark.name + 
          (bookmark.urls?.[0]?.url || '') +
          (bookmark.notes || '') +
          (bookmark.pinyinInitials || '') +
          (bookmark.pinyinFull || '')
        ).toLowerCase();
        return searchText.includes(keyword.toLowerCase());
      });
    });
  }

  // 按标签过滤（AND：书签必须包含所有选中的标签）
  if (selectedTagIds.value.length > 0) {
    results = results.filter(bookmark =>
      selectedTagIds.value.every(tagId => bookmark.tagIds?.includes(tagId))
    );
  }

  // 按关联过滤（AND：书签的账号必须关联所有选中的关联项）
  if (selectedRelationIds.value.length > 0) {
    results = results.filter(bookmark => {
      const allRelatedIds = bookmark.accounts?.flatMap(a => a.relatedIds || []) || [];
      return selectedRelationIds.value.every(rid => allRelatedIds.includes(rid));
    });
  }
  
  // 按最近使用排序
  return results.sort((a, b) => {
    const dateA = a.lastUsedAt ? new Date(a.lastUsedAt).getTime() : 0;
    const dateB = b.lastUsedAt ? new Date(b.lastUsedAt).getTime() : 0;
    return dateB - dateA;
  });
});

function getTagName(tagId: number): string {
  const tag = tagsStore.tags.find(t => t.id === tagId);
  return tag ? tag.name : String(tagId);
}

function getTagColor(tagId: number): string {
  const tag = tagsStore.tags.find(t => t.id === tagId);
  return tag?.color || '#9CA3AF';
}

function getBookmarkBorderColor(bookmark: Bookmark): string {
  if (bookmark.tagIds && bookmark.tagIds.length > 0) {
    return getTagColor(bookmark.tagIds[0]);
  }
  return '#9CA3AF';
}

function getBookmarkBgColor(bookmark: Bookmark): string {
  return toSoftBackground(getBookmarkBorderColor(bookmark));
}

function formatDate(dateStr?: string) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 搜索
function handleSearch() {
  selectedIndex.value = null;
}

// 键盘导航
function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    const max = filteredBookmarks.value.length - 1;
    if (selectedIndex.value === null) {
      selectedIndex.value = 0;
    } else if (selectedIndex.value < max) {
      selectedIndex.value++;
    }
    scrollToSelected();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (selectedIndex.value === null) {
      selectedIndex.value = 0;
    } else if (selectedIndex.value > 0) {
      selectedIndex.value--;
    }
    scrollToSelected();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (selectedIndex.value !== null && filteredBookmarks.value.length > 0) {
      openBookmark(filteredBookmarks.value[selectedIndex.value]);
    }
  } else if (e.key === 'Escape') {
    e.preventDefault();
    selectedIndex.value = null;
    searchInput.value?.focus();
  }
}

function handleSearchKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault();
    handleSearch();
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (filteredBookmarks.value.length > 0) {
      selectedIndex.value = 0;
      resultsArea.value?.focus();
      scrollToSelected();
    }
  } else if (e.key === 'Escape') {
    // No action inside search
  }
}

// Url dialog keys
function handleUrlDialogKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (selectedUrlIndex.value < currentUrls.value.length - 1) {
      selectedUrlIndex.value++;
    }
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (selectedUrlIndex.value > 0) {
      selectedUrlIndex.value--;
    }
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (currentUrls.value.length > 0) {
      openUrl(currentUrls.value[selectedUrlIndex.value]);
    }
  }
}

// Account dialog keys
function handleAccountDialogKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (selectedAccountIndex.value < currentAccounts.value.length - 1) {
      selectedAccountIndex.value++;
    }
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (selectedAccountIndex.value > 0) {
      selectedAccountIndex.value--;
    }
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (currentAccounts.value.length > 0) {
      confirmCopyAccount(currentAccounts.value[selectedAccountIndex.value]);
    }
  }
}


// 滚动到选中项
function scrollToSelected() {
  if (selectedIndex.value === null) return;
  nextTick(() => {
    const items = document.querySelectorAll('.bookmark-item');
    const selected = items[selectedIndex.value!] as HTMLElement;
    if (selected) {
      selected.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  });
}

// 打开书签
async function openBookmark(bookmark: Bookmark) {
  if (bookmark.urls && bookmark.urls.length > 0) {
    // 按最近使用日期排序
    const sortedUrls = [...bookmark.urls].sort((a, b) => {
      const dateA = a.lastUsed ? new Date(a.lastUsed).getTime() : 0;
      const dateB = b.lastUsed ? new Date(b.lastUsed).getTime() : 0;
      return dateB - dateA;
    });

    if (sortedUrls.length === 1) {
      // 只有一个网址，直接打开
      await bookmarksStore.markAsUsed(bookmark.id!);
      browser.tabs.create({ url: sortedUrls[0].url });
    } else {
      // 多个网址，弹出选择框
      showUrlSelector(bookmark, sortedUrls);
    }
  }
}

function showUrlSelector(bookmark: Bookmark, urls: UrlItem[]) {
  currentUrlBookmark.value = bookmark;
  currentUrls.value = urls;
  selectedUrlIndex.value = 0;
  urlDialogVisible.value = true;
}

async function openUrl(urlItem: UrlItem) {
  if (currentUrlBookmark.value?.id) {
    await bookmarksStore.markAsUsed(currentUrlBookmark.value.id);
  }
  browser.tabs.create({ url: urlItem.url });
  urlDialogVisible.value = false;
}

// 复制用户名
async function copyUsername(bookmark: Bookmark) {
  if (bookmark.accounts && bookmark.accounts.length > 0) {
    if (bookmark.accounts.length === 1) {
      await performCopy(bookmark.accounts[0].username, '已复制用户名');
    } else {
      showAccountSelector(bookmark, bookmark.accounts, 'username');
    }
  }
}

// 复制密码
async function copyPassword(bookmark: Bookmark) {
  if (bookmark.accounts && bookmark.accounts.length > 0) {
    if (bookmark.accounts.length === 1) {
      // 按需解密密码
      try {
        const decryptedBookmark = await keeperClient.getBookmark(bookmark.id, true);
        const account = decryptedBookmark.accounts.find(a => a.id === bookmark.accounts[0].id);
        if (account) {
          await performCopy(account.password, '已复制密码');
        }
      } catch (error) {
        ElMessage.error('获取密码失败');
      }
    } else {
      showAccountSelector(bookmark, bookmark.accounts, 'password');
    }
  }
}

function showAccountSelector(bookmark: Bookmark, accounts: AccountItem[], type: 'username' | 'password') {
  currentAccountBookmark.value = bookmark;
  currentAccounts.value = accounts;
  selectedAccountIndex.value = 0;
  accountCopyType.value = type;
  accountDialogVisible.value = true;
}

async function confirmCopyAccount(account: AccountItem) {
  if (accountCopyType.value === 'username') {
    await performCopy(account.username, '已复制用户名');
  } else {
    // 按需解密密码
    try {
      const bookmark = currentAccountBookmark.value;
      if (bookmark) {
        const decryptedBookmark = await keeperClient.getBookmark(bookmark.id, true);
        const decryptedAccount = decryptedBookmark.accounts.find(a => a.id === account.id);
        if (decryptedAccount) {
          await performCopy(decryptedAccount.password, '已复制密码');
        }
      }
    } catch (error) {
      ElMessage.error('获取密码失败');
    }
  }
  accountDialogVisible.value = false;
}

async function performCopy(text: string, msg: string) {
  await navigator.clipboard.writeText(text);
  ElMessage.success(msg);
}

// 编辑书签
function editBookmark(bookmark: Bookmark) {
  emit('edit', bookmark);
}

// 新增书签
function addBookmark() {
  emit('edit', null);
}

onMounted(async () => {
  bookmarksStore.startListening();
  await Promise.all([
    bookmarksStore.fetchBookmarks(),
    tagsStore.fetchTags(),
    relationsStore.fetchRelations()
  ]);
  searchInput.value?.focus();
  window.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.closest('input, button, a, [role="button"], [tabindex], .el-input, .el-button, .el-select, .el-dialog')) {
      return;
    }
    searchInput.value?.focus();
  });
});
</script>

<template>
  <div class="main-page">
    <!-- 搜索栏 -->
    <div class="search-bar">
      <el-input
        ref="searchInput"
        v-model="searchQuery"
        placeholder="搜索书签..."
        clearable
        :prefix-icon="Search"
        @keydown="handleSearchKeydown"
      />
    </div>

    <!-- 过滤栏 -->
    <div class="filter-bar">
      <el-select
        v-model="selectedTagIds"
        multiple
        collapse-tags
        collapse-tags-tooltip
        clearable
        placeholder="标签"
        class="filter-select"
      >
        <el-option
          v-for="tag in tagsStore.tags"
          :key="tag.id"
          :label="tag.name"
          :value="tag.id"
        >
          <span class="tag-option">
            <span class="tag-color-dot" :style="{ backgroundColor: getTagColor(tag.id) }"></span>
            {{ tag.name }}
          </span>
        </el-option>
      </el-select>
      <el-select
        v-model="selectedRelationIds"
        multiple
        collapse-tags
        collapse-tags-tooltip
        clearable
        placeholder="关联"
        class="filter-select"
      >
        <el-option
          v-for="relation in relationsStore.relations"
          :key="relation.id"
          :label="relation.name"
          :value="relation.id"
        />
      </el-select>
    </div>

    <!-- 书签列表 -->
    <div 
      class="bookmark-list-container" 
      ref="resultsArea" 
      tabindex="-1" 
      @keydown="handleKeydown"
    >
      <el-scrollbar>
        <div class="bookmark-list">
          <div
            v-for="(bookmark, index) in filteredBookmarks"
            :key="bookmark.id"
            :class="['bookmark-item', { selected: index === selectedIndex }]"
            :style="{
              borderLeftColor: getBookmarkBorderColor(bookmark),
              backgroundColor: getBookmarkBgColor(bookmark),
              '--item-color': getBookmarkBorderColor(bookmark),
            }"
            @click="openBookmark(bookmark)"
          >
            <div class="bookmark-info">
              <div class="bookmark-name">{{ bookmark.name }}</div>
              <div class="bookmark-url">
                {{ bookmark.urls?.[0]?.url || '无网址' }}
              </div>
            </div>
            <div class="bookmark-actions">
              <el-button link class="action-btn" @click.stop="copyUsername(bookmark)" title="复制用户名">
                <el-icon><DocumentCopy /></el-icon>
              </el-button>
              <el-button link class="action-btn" @click.stop="copyPassword(bookmark)" title="复制密码">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
              </el-button>
              <el-button link class="action-btn" @click.stop="editBookmark(bookmark)" title="编辑">
                <el-icon><Setting /></el-icon>
              </el-button>
            </div>
          </div>

          <!-- 无结果 -->
          <div v-if="filteredBookmarks.length === 0" class="empty-state">
            <p>没有找到书签</p>
          </div>
        </div>
      </el-scrollbar>
    </div>

    <!-- 底部操作栏 -->
    <div class="bottom-bar">
      <el-button text class="bottom-btn" @click="addBookmark">
        <el-icon><Plus /></el-icon> 新增
      </el-button>
      <el-button text class="bottom-btn" @click="emit('settings')">
        <el-icon><Setting /></el-icon> 设置
      </el-button>
    </div>

    <!-- 多URL选择弹窗 -->
    <el-dialog
      v-model="urlDialogVisible"
      title="选择要打开的网址"
      width="90%"
      center
      @opened="$refs.urlDialogArea?.focus()"
    >
      <div 
        class="dialog-list" 
        ref="urlDialogArea" 
        tabindex="-1" 
        @keydown="handleUrlDialogKeydown"
      >
        <div
          v-for="(url, index) in currentUrls"
          :key="index"
          :class="['dialog-list-item', { selected: index === selectedUrlIndex }]"
          @click="openUrl(url)"
        >
          <div class="url-text">{{ url.url }}</div>
        </div>
      </div>
    </el-dialog>

    <!-- 多账号选择弹窗 -->
    <el-dialog
      v-model="accountDialogVisible"
      :title="accountCopyType === 'username' ? '选择要复制的用户名' : '选择要复制密码的账号'"
      width="90%"
      center
      @opened="$refs.accountDialogArea?.focus()"
    >
      <div 
        class="dialog-list" 
        ref="accountDialogArea" 
        tabindex="-1" 
        @keydown="handleAccountDialogKeydown"
      >
        <div
          v-for="(account, index) in currentAccounts"
          :key="account.id"
          :class="['dialog-list-item', { selected: index === selectedAccountIndex }]"
          @click="confirmCopyAccount(account)"
        >
          <div class="account-text">{{ account.username }}</div>
          <div class="account-meta">最后使用: {{ formatDate(account.lastUsed) }}</div>
        </div>
      </div>
    </el-dialog>

  </div>
</template>

<style scoped>
.main-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background-color: var(--color-bg, #ffffff);
  color: var(--color-text-primary, #333333);
}

.search-bar {
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border, #eeeeee);
}

.filter-bar {
  display: flex;
  gap: 8px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--color-border, #eeeeee);
}

.filter-select {
  flex: 1;
  min-width: 0;
}

.bookmark-list-container {
  flex: 1;
  overflow: hidden;
  outline: none;
}

.bookmark-list {
  padding: 8px 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.bookmark-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 16px;
  cursor: pointer;
  transition: background 0.15s, outline 0.15s;
  border-left: 3px solid transparent;
}

.bookmark-item:hover {
  background: var(--color-bg-hover, #f5f5f5);
}

.bookmark-item.selected {
  outline: 2px solid var(--item-color, #9CA3AF);
  outline-offset: -2px;
  background-color: color-mix(in srgb, var(--item-color, #9CA3AF) 15%, transparent) !important;
}

.bookmark-info {
  flex: 1;
  min-width: 0;
}

.bookmark-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-primary, #333333);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bookmark-url {
  font-size: 12px;
  color: var(--color-text-secondary, #999999);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 2px;
}

.bookmark-actions {
  display: flex;
  gap: 4px;
  margin-left: 12px;
}

.action-btn {
  padding: 6px;
  color: var(--color-text-secondary, #999999);
}

.action-btn:hover {
  color: var(--color-accent, #e74c3c);
}

.empty-state {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 200px;
  color: var(--color-text-secondary, #999999);
}

.bottom-bar {
  display: flex;
  border-top: 1px solid var(--color-border, #eeeeee);
  padding: 4px;
}

.bottom-btn {
  flex: 1;
  margin: 0 !important;
  color: var(--color-text-regular, #666666);
}

.bottom-btn:hover {
  color: var(--color-accent, #e74c3c);
}

.dialog-list {
  outline: none;
  max-height: 60vh;
  overflow-y: auto;
}

.dialog-list-item {
  padding: 12px 16px;
  cursor: pointer;
  border-left: 3px solid transparent;
  transition: all 0.2s;
  border-bottom: 1px solid var(--color-border, #eeeeee);
}

.dialog-list-item:last-child {
  border-bottom: none;
}

.dialog-list-item:hover {
  background: var(--color-bg-hover, #f5f5f5);
}

.dialog-list-item.selected {
  background: var(--color-accent-soft, #fff0f0);
  border-left: 3px solid var(--color-accent, #e74c3c);
}

.url-text, .account-text {
  font-size: 14px;
  color: var(--color-text-primary, #333333);
  word-break: break-all;
}

.url-meta, .account-meta {
  font-size: 12px;
  color: var(--color-text-secondary, #999999);
  margin-top: 4px;
}

/* 暗色模式支持 */
:global(.dark) .dialog-list-item.selected {
  background: var(--color-accent-soft, #3d2020);
}

.tag-option {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tag-color-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}
</style>
