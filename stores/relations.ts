/**
 * 关联 Store
 *
 * 管理关联（如手机号、邮箱等）的 CRUD 操作
 */

import { defineStore } from 'pinia';
import { ref } from 'vue';
import { keeperClient, KeeperApiError, type Relation, type RelationCreate, type RelationUpdate } from '../api';
import { useAuthStore } from './auth';

export const useRelationsStore = defineStore('relations', () => {
  // === State ===
  const relations = ref<Relation[]>([]);
  const total = ref(0);
  const loading = ref(false);
  const error = ref<string | null>(null);

  // === Getters ===

  /** 按 ID 获取关联 */
  function getRelationById(id: number): Relation | undefined {
    return relations.value.find((r) => r.id === id);
  }

  /** 按名称获取关联 */
  function getRelationByName(name: string): Relation | undefined {
    return relations.value.find((r) => r.name === name);
  }

  // === Actions ===

  /** 获取关联列表 */
  async function fetchRelations(): Promise<void> {
    const authStore = useAuthStore();
    
    if (authStore.locked) {
      error.value = '请先解锁';
      return;
    }

    loading.value = true;
    error.value = null;

    try {
      const response = await keeperClient.getRelations();
      relations.value = response.data;
      total.value = response.total;
    } catch (e) {
      if (e instanceof KeeperApiError) {
        error.value = e.detail;
      } else {
        error.value = '获取关联列表失败';
      }
      relations.value = [];
      total.value = 0;
    } finally {
      loading.value = false;
    }
  }

  /** 获取单个关联 */
  async function getRelation(id: number): Promise<Relation | null> {
    const authStore = useAuthStore();
    
    if (authStore.locked) {
      error.value = '请先解锁';
      return null;
    }

    loading.value = true;
    error.value = null;

    try {
      return await keeperClient.getRelation(id);
    } catch (e) {
      if (e instanceof KeeperApiError) {
        error.value = e.detail;
      } else {
        error.value = '获取关联失败';
      }
      return null;
    } finally {
      loading.value = false;
    }
  }

  /** 创建关联 */
  async function createRelation(data: RelationCreate): Promise<Relation | null> {
    const authStore = useAuthStore();
    
    if (authStore.locked) {
      error.value = '请先解锁';
      return null;
    }

    loading.value = true;
    error.value = null;

    try {
      const relation = await keeperClient.createRelation(data);
      relations.value.push(relation);
      total.value += 1;
      return relation;
    } catch (e) {
      if (e instanceof KeeperApiError) {
        error.value = e.detail;
      } else {
        error.value = '创建关联失败';
      }
      return null;
    } finally {
      loading.value = false;
    }
  }

  /** 更新关联 */
  async function updateRelation(id: number, data: RelationUpdate): Promise<Relation | null> {
    const authStore = useAuthStore();
    
    if (authStore.locked) {
      error.value = '请先解锁';
      return null;
    }

    loading.value = true;
    error.value = null;

    try {
      const relation = await keeperClient.updateRelation(id, data);
      // 更新列表中的关联
      const index = relations.value.findIndex((r) => r.id === id);
      if (index !== -1) {
        relations.value[index] = relation;
      }
      return relation;
    } catch (e) {
      if (e instanceof KeeperApiError) {
        error.value = e.detail;
      } else {
        error.value = '更新关联失败';
      }
      return null;
    } finally {
      loading.value = false;
    }
  }

  /** 删除关联 */
  async function deleteRelation(id: number, cascade: boolean = false): Promise<boolean> {
    const authStore = useAuthStore();
    
    if (authStore.locked) {
      error.value = '请先解锁';
      return false;
    }

    loading.value = true;
    error.value = null;

    try {
      await keeperClient.deleteRelation(id, cascade);
      // 从列表中移除
      relations.value = relations.value.filter((r) => r.id !== id);
      total.value -= 1;
      return true;
    } catch (e) {
      if (e instanceof KeeperApiError) {
        error.value = e.detail;
      } else {
        error.value = '删除关联失败';
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
    relations.value = [];
    total.value = 0;
    loading.value = false;
    error.value = null;
  }

  return {
    // State
    relations,
    total,
    loading,
    error,
    
    // Getters
    getRelationById,
    getRelationByName,
    
    // Actions
    fetchRelations,
    getRelation,
    createRelation,
    updateRelation,
    deleteRelation,
    clearError,
    reset,
  };
});
