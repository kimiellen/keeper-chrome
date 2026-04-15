/**
 * 认证 Store
 *
 * 管理用户解锁/锁定状态，与 API 客户端集成。
 * 方案B：纯后端加密，前端直接发送明文密码，不做任何本地加解密。
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { keeperClient, KeeperApiError } from '../api';

export const useAuthStore = defineStore('auth', () => {
  // === State ===
  const locked = ref(true);
  const loading = ref(false);
  const error = ref<string | null>(null);

  const isInitialized = ref(false);
  
  // === Getters ===
  
  /** 是否已解锁 */
  const isUnlocked = computed(() => !locked.value);
  
  /** 是否有错误 */
  const hasError = computed(() => error.value !== null);
  
  // === Actions ===

  /** 检查初始是否已初始化（数据库是否有认证信息） */
  async function checkInitialized(): Promise<boolean> {
    try {
      // 尝试获取状态，如果返回 401 说明已初始化但未解锁
      await keeperClient.getStatus();
      isInitialized.value = true;
      return true;
    } catch (e) {
      if (e instanceof KeeperApiError && e.status === 400) {
        // 400 说明未初始化
        isInitialized.value = false;
        return false;
      }
      // 其他错误假设已初始化
      isInitialized.value = true;
      return true;
    }
  }

  /** 检查会话状态 */
  async function checkStatus(): Promise<void> {
    loading.value = true;
    error.value = null;
    
    // 加载已保存的 token
    await keeperClient.loadToken();
    
    try {
      const status = await keeperClient.getStatus();
      
      if ('locked' in status && status.locked) {
        locked.value = true;

      } else {
        locked.value = false;
      }
    } catch (e) {
      locked.value = true;
    } finally {
      loading.value = false;
    }
  }

  /** 初始化（首次使用），直接发送明文密码给后端 */
  async function initialize(email: string, password: string): Promise<void> {
    loading.value = true;
    error.value = null;
    
    try {
      await keeperClient.initialize({ email, password });
      isInitialized.value = true;
    } catch (e) {
      if (e instanceof KeeperApiError) {
        error.value = e.detail;
      } else {
        error.value = '初始化失败';
      }
      throw e;
    } finally {
      loading.value = false;
    }
  }

  // 防止重复解锁的标记
  let isUnlocking = false;

  /** 解锁（登录），直接发送明文密码给后端 */
  async function unlock(password: string): Promise<void> {
    // 防止重复调用
    if (isUnlocking) {
      console.log('[Keeper:Auth] Unlock already in progress, skipping');
      return;
    }
    
    isUnlocking = true;
    loading.value = true;
    error.value = null;
    
    try {
      console.log('[Keeper:Auth] Unlocking...');
      const response = await keeperClient.unlock({ password });
      console.log('[Keeper:Auth] Unlock response:', response);
      // 保存 token 到客户端
      if (response.token) {
        console.log('[Keeper:Auth] Saving token:', response.token.substring(0, 10) + '...');
        await keeperClient.setToken(response.token);
      } else {
        console.log('[Keeper:Auth] No token in response!');
      }
      locked.value = false;
    } catch (e) {
      if (e instanceof KeeperApiError) {
        error.value = e.detail;
      } else {
        error.value = '解锁失败';
      }
      throw e;
    } finally {
      loading.value = false;
      isUnlocking = false;
    }
  }

  /** 锁定（登出） */
  async function lock(): Promise<void> {
    loading.value = true;
    error.value = null;
    
    try {
      await keeperClient.lock();
    } finally {
      locked.value = true;
      loading.value = false;
      // 清除 token
      await keeperClient.setToken(null);
    }
  }

  /** 清除错误 */
  function clearError(): void {
    error.value = null;
  }

  /** 重置状态（用于退出登录等） */
  function reset(): void {
    locked.value = true;
    loading.value = false;
    error.value = null;
  }

  return {
    // State
    locked,
    loading,
    error,
    isInitialized,
    
    // Getters
    isUnlocked,
    hasError,
    
    // Actions
    checkInitialized,
    checkStatus,
    initialize,
    unlock,
    lock,
    clearError,
    reset,
  };
});
