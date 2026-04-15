/**
 * 书签 Store
 *
 * 管理书签列表、搜索、CRUD 操作
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { keeperClient, KeeperApiError, type Bookmark, type BookmarkCreate, type BookmarkUpdate, type BookmarkListParams } from '../api';
import { useAuthStore } from './auth';

export const useBookmarksStore = defineStore('bookmarks', () => {
  // === State ===
  const bookmarks = ref<Bookmark[]>([]);
  const total = ref(0);
  const loading = ref(false);
  const error = ref<string | null>(null);
  
  // 当前查询参数
  const currentParams = ref<BookmarkListParams>({
    limit: 5000,  // 一次性加载全部（足够覆盖用户数据量）
    offset: 0,
    sort: '-lastUsedAt',
  });

  // === Getters ===

  /** 按标签筛选的书签 */
  function bookmarksByTag(tagId: number): Bookmark[] {
    return bookmarks.value.filter((b) => b.tagIds.includes(tagId));
  }

  /** 搜索书签（本地过滤） */
  function searchBookmarks(query: string): Bookmark[] {
    if (!query.trim()) {
      return bookmarks.value;
    }
    
    const keywords = query.toLowerCase().split(/\s+/);
    
    return bookmarks.value.filter((bookmark) => {
      const searchText = [
        bookmark.name,
        bookmark.pinyinInitials,
        bookmark.notes,
        ...bookmark.urls.map((u) => u.url),
        ...bookmark.accounts.map((a) => a.username),
      ]
        .join(' ')
        .toLowerCase();
      
      return keywords.every((keyword) => searchText.includes(keyword));
    });
  }

  /** 最近使用的书签 */
  const recentlyUsed = computed(() => {
    return [...bookmarks.value].sort((a, b) => {
      const aTime = new Date(a.lastUsedAt).getTime();
      const bTime = new Date(b.lastUsedAt).getTime();
      return bTime - aTime;
    });
  });

  /** 是否有更多数据 */
  const hasMore = computed(() => {
    return bookmarks.value.length < total.value;
  });

  // === Actions ===

  /** 获取书签列表 */
  async function fetchBookmarks(params?: Partial<BookmarkListParams>): Promise<void> {
    loading.value = true;
    error.value = null;
    
    // 合并查询参数
    const queryParams = { ...currentParams.value, ...params };
    currentParams.value = queryParams;

    try {
      console.log('[Keeper:store] fetching bookmarks...');
      const response = await keeperClient.getBookmarks(queryParams);
      console.log('[Keeper:store] got bookmarks:', response.data.length);
      // DEBUG: 验证密码是否为加密格式
      if (response.data.length > 0 && response.data[0].accounts.length > 0) {
        const pwd = response.data[0].accounts[0].password;
        console.log('[Keeper:DEBUG] First account password:', pwd.substring(0, 20) + '...');
        console.log('[Keeper:DEBUG] Is encrypted:', pwd.startsWith('v1.'));
      }
      bookmarks.value = response.data;
      total.value = response.total;
    } catch (e) {
      if (e instanceof KeeperApiError) {
        error.value = e.detail;
        // 401 时自动锁定
        if (e.status === 401) {
          const authStore = useAuthStore();
          authStore.lock();
        }
      } else {
        error.value = '获取书签列表失败';
      }
      bookmarks.value = [];
      total.value = 0;
    } finally {
      loading.value = false;
    }
  }

  /** 加载更多书签（分页） */
  async function loadMore(): Promise<void> {
    if (!hasMore.value || loading.value) return;
    
    const newParams = {
      ...currentParams.value,
      offset: currentParams.value.offset! + (currentParams.value.limit || 50),
    };
    
    loading.value = true;
    error.value = null;

    try {
      const response = await keeperClient.getBookmarks(newParams);
      bookmarks.value = [...bookmarks.value, ...response.data];
      total.value = response.total;
      currentParams.value = newParams;
    } catch (e) {
      if (e instanceof KeeperApiError) {
        error.value = e.detail;
      } else {
        error.value = '加载更多失败';
      }
    } finally {
      loading.value = false;
    }
  }

  /** 搜索书签（API 搜索） */
  async function search(query: string): Promise<void> {
    await fetchBookmarks({ search: query, offset: 0 });
  }

  /** 按标签筛选 */
  async function filterByTags(tagIds: string): Promise<void> {
    await fetchBookmarks({ tagIds, offset: 0 });
  }

  /** 获取单个书签 */
  async function getBookmark(id: string): Promise<Bookmark | null> {
    const authStore = useAuthStore();
    
    if (authStore.locked) {
      error.value = '请先解锁';
      return null;
    }

    loading.value = true;
    error.value = null;

    try {
      return await keeperClient.getBookmark(id);
    } catch (e) {
      if (e instanceof KeeperApiError) {
        error.value = e.detail;
      } else {
        error.value = '获取书签失败';
      }
      return null;
    } finally {
      loading.value = false;
    }
  }

  /** 创建书签 */
  async function createBookmark(data: BookmarkCreate): Promise<Bookmark | null> {
    const authStore = useAuthStore();
    
    if (authStore.locked) {
      error.value = '请先解锁';
      return null;
    }

    loading.value = true;
    error.value = null;

    try {
      const bookmark = await keeperClient.createBookmark(data);
      // 添加到列表开头
      bookmarks.value = [bookmark, ...bookmarks.value];
      total.value += 1;
      return bookmark;
    } catch (e) {
      if (e instanceof KeeperApiError) {
        error.value = e.detail;
      } else {
        error.value = '创建书签失败';
      }
      return null;
    } finally {
      loading.value = false;
    }
  }

  /** 更新书签 */
  async function updateBookmark(id: string, data: BookmarkUpdate): Promise<Bookmark | null> {
    const authStore = useAuthStore();
    
    if (authStore.locked) {
      error.value = '请先解锁';
      return null;
    }

    loading.value = true;
    error.value = null;

    try {
      const bookmark = await keeperClient.updateBookmark(id, data);
      // 更新列表中的书签
      const index = bookmarks.value.findIndex((b) => b.id === id);
      if (index !== -1) {
        bookmarks.value[index] = bookmark;
      }
      return bookmark;
    } catch (e) {
      if (e instanceof KeeperApiError) {
        error.value = e.detail;
      } else {
        error.value = '更新书签失败';
      }
      return null;
    } finally {
      loading.value = false;
    }
  }

  /** 删除书签 */
  async function deleteBookmark(id: string): Promise<boolean> {
    const authStore = useAuthStore();
    
    if (authStore.locked) {
      error.value = '请先解锁';
      return false;
    }

    loading.value = true;
    error.value = null;

    try {
      await keeperClient.deleteBookmark(id);
      // 从列表中移除
      bookmarks.value = bookmarks.value.filter((b) => b.id !== id);
      total.value -= 1;
      return true;
    } catch (e) {
      if (e instanceof KeeperApiError) {
        error.value = e.detail;
      } else {
        error.value = '删除书签失败';
      }
      return false;
    } finally {
      loading.value = false;
    }
  }

  /** 更新使用时间 */
  async function markAsUsed(id: string, url?: string, accountId?: number): Promise<boolean> {
    const authStore = useAuthStore();
    
    if (authStore.locked) {
      return false;
    }

    try {
      await keeperClient.useBookmark(id, { url, accountId: accountId });
      // 更新本地状态
      const bookmark = bookmarks.value.find((b) => b.id === id);
      if (bookmark) {
        bookmark.lastUsedAt = new Date().toISOString();
        
        // 如果更新了 URL 或账号的使用时间
        if (url) {
          const urlItem = bookmark.urls.find((u) => u.url === url);
          if (urlItem) {
            urlItem.lastUsed = new Date().toISOString();
          }
        }
        if (accountId) {
          const account = bookmark.accounts.find((a) => a.id === accountId);
          if (account) {
            account.lastUsed = new Date().toISOString();
          }
        }
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  /** 清除错误 */
  function clearError(): void {
    error.value = null;
  }

  /** 重置状态 */
  function reset(): void {
    bookmarks.value = [];
    total.value = 0;
    loading.value = false;
    error.value = null;
    currentParams.value = {
      limit: 50,
      offset: 0,
      sort: '-lastUsedAt',
    };
  }

  let listening = false;

  function startListening(): void {
    if (listening) return;
    listening = true;
    console.log('[Keeper:store] startListening registered');
    browser.storage.onChanged.addListener((changes, area) => {
      console.log('[Keeper:store] storage.onChanged fired', area, Object.keys(changes));
      if (area === 'local' && changes.bookmarkChangedAt) {
        // 只有未锁定时才自动获取
        const authStore = useAuthStore();
        if (!authStore.locked) {
          console.log('[Keeper:store] bookmarkChangedAt changed, fetching bookmarks');
          void fetchBookmarks();
        }
      }
    });
  }

  return {
    // State
    bookmarks,
    total,
    loading,
    error,
    currentParams,
    
    // Getters
    bookmarksByTag,
    searchBookmarks,
    recentlyUsed,
    hasMore,
    
    // Actions
    fetchBookmarks,
    loadMore,
    search,
    filterByTags,
    getBookmark,
    createBookmark,
    updateBookmark,
    deleteBookmark,
    markAsUsed,
    clearError,
    reset,
    startListening,
  };
});
