import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { keeperClient, KeeperApiError } from '../api';
import type { DatabaseInfo } from '../api/types';

export const useDatabaseStore = defineStore('database', () => {
  // State
  const databases = ref<DatabaseInfo[]>([]);
  const currentPath = ref<string | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  // Getters
  const currentDatabase = computed(() => 
    databases.value.find(db => db.path === currentPath.value) || null
  );
  const currentName = computed(() => currentDatabase.value?.name || '未选择数据库');

  // Actions
  async function fetchList() {
    loading.value = true;
    error.value = null;
    try {
      const response = await keeperClient.listDatabases();
      databases.value = response.databases;
      currentPath.value = response.current;
    } catch (e: any) {
      error.value = e instanceof KeeperApiError ? e.detail : e.message;
      console.error('Failed to fetch database list:', e);
    } finally {
      loading.value = false;
    }
  }

  async function openDatabase(path: string) {
    loading.value = true;
    error.value = null;
    try {
      await keeperClient.openDatabase({ path });
      await fetchList(); // Refresh the list and current db
      return true;
    } catch (e: any) {
      error.value = e instanceof KeeperApiError ? e.detail : e.message;
      return false;
    } finally {
      loading.value = false;
    }
  }

  async function createDatabase(path: string, email: string, password: string) {
    loading.value = true;
    error.value = null;
    try {
      await keeperClient.createDatabase({ path, email, password });
      await fetchList();
      return true;
    } catch (e: any) {
      error.value = e instanceof KeeperApiError ? e.detail : e.message;
      return false;
    } finally {
      loading.value = false;
    }
  }

  async function removeDatabase(path: string) {
    error.value = null;
    try {
      await keeperClient.removeDatabase({ path });
      await fetchList();
      return true;
    } catch (e: any) {
      error.value = e instanceof KeeperApiError ? e.detail : e.message;
      return false;
    }
  }

  async function addDatabase(path: string) {
    loading.value = true;
    error.value = null;
    try {
      await keeperClient.addDatabase({ path });
      await fetchList(); // 刷新列表
      return true;
    } catch (e: any) {
      error.value = e instanceof KeeperApiError ? e.detail : e.message;
      return false;
    } finally {
      loading.value = false;
    }
  }

  function clearError() {
    error.value = null;
  }

  return { databases, currentPath, loading, error, currentDatabase, currentName, fetchList, openDatabase, createDatabase, removeDatabase, addDatabase, clearError };
});
