/**
 * 标签 Store
 *
 * 管理标签的 CRUD 操作
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { keeperClient, KeeperApiError, type Tag, type TagCreate, type TagUpdate } from '../api';
import { useAuthStore } from './auth';

export const useTagsStore = defineStore('tags', () => {
  // === State ===
  const tags = ref<Tag[]>([]);
  const total = ref(0);
  const loading = ref(false);
  const error = ref<string | null>(null);

  // === Getters ===

  /** 按 ID 获取标签 */
  function getTagById(id: number): Tag | undefined {
    return tags.value.find((t) => t.id === id);
  }

  /** 按名称获取标签 */
  function getTagByName(name: string): Tag | undefined {
    return tags.value.find((t) => t.name === name);
  }

  // === Actions ===

  /** 获取标签列表 */
  async function fetchTags(): Promise<void> {
    const authStore = useAuthStore();
    
    if (authStore.locked) {
      error.value = '请先解锁';
      return;
    }

    loading.value = true;
    error.value = null;

    try {
      const response = await keeperClient.getTags({ sort: 'name' });
      tags.value = response.data;
      total.value = response.total;
    } catch (e) {
      if (e instanceof KeeperApiError) {
        error.value = e.detail;
      } else {
        error.value = '获取标签列表失败';
      }
      tags.value = [];
      total.value = 0;
    } finally {
      loading.value = false;
    }
  }

  /** 获取单个标签 */
  async function getTag(id: number): Promise<Tag | null> {
    const authStore = useAuthStore();
    
    if (authStore.locked) {
      error.value = '请先解锁';
      return null;
    }

    loading.value = true;
    error.value = null;

    try {
      return await keeperClient.getTag(id);
    } catch (e) {
      if (e instanceof KeeperApiError) {
        error.value = e.detail;
      } else {
        error.value = '获取标签失败';
      }
      return null;
    } finally {
      loading.value = false;
    }
  }

  /** 创建标签 */
  async function createTag(data: TagCreate): Promise<Tag | null> {
    const authStore = useAuthStore();
    
    if (authStore.locked) {
      error.value = '请先解锁';
      return null;
    }

    loading.value = true;
    error.value = null;

    try {
      const tag = await keeperClient.createTag(data);
      // 添加到列表（按名称排序插入）
      const index = tags.value.findIndex((t) => t.name.localeCompare(tag.name) > 0);
      if (index === -1) {
        tags.value.push(tag);
      } else {
        tags.value.splice(index, 0, tag);
      }
      total.value += 1;
      return tag;
    } catch (e) {
      if (e instanceof KeeperApiError) {
        error.value = e.detail;
      } else {
        error.value = '创建标签失败';
      }
      return null;
    } finally {
      loading.value = false;
    }
  }

  /** 更新标签 */
  async function updateTag(id: number, data: TagUpdate): Promise<Tag | null> {
    const authStore = useAuthStore();
    
    if (authStore.locked) {
      error.value = '请先解锁';
      return null;
    }

    loading.value = true;
    error.value = null;

    try {
      const tag = await keeperClient.updateTag(id, data);
      // 更新列表中的标签
      const index = tags.value.findIndex((t) => t.id === id);
      if (index !== -1) {
        tags.value[index] = tag;
      }
      return tag;
    } catch (e) {
      if (e instanceof KeeperApiError) {
        error.value = e.detail;
      } else {
        error.value = '更新标签失败';
      }
      return null;
    } finally {
      loading.value = false;
    }
  }

  /** 删除标签 */
  async function deleteTag(id: number, cascade: boolean = false): Promise<boolean> {
    const authStore = useAuthStore();
    
    if (authStore.locked) {
      error.value = '请先解锁';
      return false;
    }

    loading.value = true;
    error.value = null;

    try {
      await keeperClient.deleteTag(id, cascade);
      // 从列表中移除
      tags.value = tags.value.filter((t) => t.id !== id);
      total.value -= 1;
      return true;
    } catch (e) {
      if (e instanceof KeeperApiError) {
        error.value = e.detail;
      } else {
        error.value = '删除标签失败';
      }
      return false;
    } finally {
      loading.value = false;
    }
  }

  /** 清除错误 */
  function clearError(): void {
    error.value = null;
  }

  /** 重置状态 */
  function reset(): void {
    tags.value = [];
    total.value = 0;
    loading.value = false;
    error.value = null;
  }

  return {
    // State
    tags,
    total,
    loading,
    error,
    
    // Getters
    getTagById,
    getTagByName,
    
    // Actions
    fetchTags,
    getTag,
    createTag,
    updateTag,
    deleteTag,
    clearError,
    reset,
  };
});
