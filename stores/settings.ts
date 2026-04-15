/**
 * 全局设置 Store
 *
 * 管理主题、密码生成器、用户名生成器等全局配置
 * 使用 browser.storage.local 存储，支持后台脚本和侧边栏共享
 */

import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import { keeperClient } from '../api';

export type Theme = 'light' | 'dark' | 'system';

export interface PasswordGeneratorConfig {
  length: number; // 6-66
  includeLowercase: boolean;
  includeUppercase: boolean;
  includeNumbers: boolean;
  includeSpecial: boolean;
}

export interface UsernameGeneratorConfig {
  length: number; // 6-12
  includeNumbers: boolean;
}

export interface SettingsState {
  theme: Theme;
  passwordGenerator: PasswordGeneratorConfig;
  usernameGenerator: UsernameGeneratorConfig;
  sessionTimeout: number; // minutes
  lockOnHide: boolean; // 隐藏侧边栏时是否锁定
  enableLoginCapture: boolean; // 是否启用登录捕获通知
}

const STORAGE_KEY = 'keeper_settings';

// 默认设置
const DEFAULT_SETTINGS: SettingsState = {
  theme: 'system',
  passwordGenerator: {
    length: 16,
    includeLowercase: true,
    includeUppercase: true,
    includeNumbers: true,
    includeSpecial: false,
  },
  usernameGenerator: {
    length: 8,
    includeNumbers: true,
  },
  sessionTimeout: 60, // 60 minutes
  lockOnHide: false, // 默认隐藏时不锁定
  enableLoginCapture: true, // 默认开启登录捕获
};

export const useSettingsStore = defineStore('settings', () => {
  // === State ===
  const settings = ref<SettingsState>({ ...DEFAULT_SETTINGS });
  const isInitialized = ref(false);

  // === Getters ===
  
  /** 当前主题（如果是 system 则根据系统偏好） */
  const effectiveTheme = computed<Theme>(() => {
    if (settings.value.theme === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
    }
    return settings.value.theme;
  });

  /** 是否是暗色主题 */
  const isDark = computed(() => effectiveTheme.value === 'dark');

  /** 密码生成器配置 */
  const passwordGenerator = computed(() => settings.value.passwordGenerator);

  /** 用户名生成器配置 */
  const usernameGenerator = computed(() => settings.value.usernameGenerator);

  // === Actions ===

  /**
   * 初始化设置（从 browser.storage.local 加载）
   */
  async function init(): Promise<void> {
    if (isInitialized.value) return;
    
    try {
      const result = await browser.storage.local.get(STORAGE_KEY);
      if (result[STORAGE_KEY]) {
        settings.value = { ...DEFAULT_SETTINGS, ...result[STORAGE_KEY] };
      } else {
        // 首次使用，保存默认设置
        await browser.storage.local.set({ [STORAGE_KEY]: DEFAULT_SETTINGS });
      }
    } catch (e) {
      console.warn('Failed to load settings:', e);
      settings.value = { ...DEFAULT_SETTINGS };
    }
    
    applyTheme();
    isInitialized.value = true;
  }

  /**
   * 保存设置到 browser.storage.local
   */
  async function saveSettings(): Promise<void> {
    try {
      // 将响应式 Proxy 转换为普通对象，避免 DataCloneError
      const plainSettings = JSON.parse(JSON.stringify(settings.value));
      await browser.storage.local.set({ [STORAGE_KEY]: plainSettings });
    } catch (e) {
      console.warn('Failed to save settings:', e);
    }
  }

  /** 设置主题 */
  async function setTheme(theme: Theme): Promise<void> {
    settings.value.theme = theme;
    applyTheme();
    await saveSettings();
  }

  /** 更新密码生成器配置 */
  async function updatePasswordGenerator(config: Partial<PasswordGeneratorConfig>): Promise<void> {
    settings.value.passwordGenerator = {
      ...settings.value.passwordGenerator,
      ...config,
    };
    await saveSettings();
  }

  /** 更新用户名生成器配置 */
  async function updateUsernameGenerator(config: Partial<UsernameGeneratorConfig>): Promise<void> {
    settings.value.usernameGenerator = {
      ...settings.value.usernameGenerator,
      ...config,
    };
    await saveSettings();
  }

  /** 设置会话超时 */
  async function setSessionTimeout(minutes: number): Promise<void> {
    settings.value.sessionTimeout = minutes;
    await saveSettings();
    // 同步到后端
    try {
      await keeperClient.setSessionTimeout(minutes);
    } catch (e) {
      console.warn('Failed to sync session timeout to backend:', e);
    }
  }

  /** 设置隐藏时锁定 */
  async function setLockOnHide(value: boolean): Promise<void> {
    settings.value.lockOnHide = value;
    await saveSettings();
  }

  /** 设置是否启用登录捕获 */
  async function setEnableLoginCapture(value: boolean): Promise<void> {
    settings.value.enableLoginCapture = value;
    await saveSettings();
  }

  /** 应用主题到 DOM */
  function applyTheme(): void {
    const theme = effectiveTheme.value;
    const html = document.documentElement;
    
    if (theme === 'dark') {
      html.classList.add('dark');
    } else {
      html.classList.remove('dark');
    }
  }

  /** 初始化主题（监听系统偏好变化） */
  function initTheme(): void {
    applyTheme();
    
    // 监听系统主题变化
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', () => {
      if (settings.value.theme === 'system') {
        applyTheme();
      }
    });
  }

  /** 重置为默认设置 */
  async function resetToDefaults(): Promise<void> {
    settings.value = { ...DEFAULT_SETTINGS };
    applyTheme();
    await saveSettings();
  }

  // 监听设置变化，自动保存
  watch(
    settings,
    async (newSettings, oldSettings) => {
      if (isInitialized.value && JSON.stringify(newSettings) !== JSON.stringify(oldSettings)) {
        await saveSettings();
      }
    },
    { deep: true }
  );

  return {
    // State
    settings,
    isInitialized,
    
    // Getters
    effectiveTheme,
    isDark,
    passwordGenerator,
    usernameGenerator,
    
    // Actions
    init,
    setTheme,
    updatePasswordGenerator,
    updateUsernameGenerator,
    setSessionTimeout,
    setLockOnHide,
    setEnableLoginCapture,
    applyTheme,
    initTheme,
    resetToDefaults,
  };
});
