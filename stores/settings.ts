/**
 * 全局设置 Store
 *
 * 管理主题、密码生成器、用户名生成器等全局配置
 */

import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';

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
  sessionTimeout: 10, // 10 minutes
};

/**
 * 加载保存的设置
 */
function loadSettings(): SettingsState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
    }
  } catch (e) {
    console.warn('Failed to load settings:', e);
  }
  return { ...DEFAULT_SETTINGS };
}

/**
 * 保存设置到 localStorage
 */
function saveSettings(settings: SettingsState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    console.warn('Failed to save settings:', e);
  }
}

export const useSettingsStore = defineStore('settings', () => {
  // === State ===
  const settings = ref<SettingsState>(loadSettings());

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

  /** 设置主题 */
  function setTheme(theme: Theme): void {
    settings.value.theme = theme;
    applyTheme();
    saveSettings(settings.value);
  }

  /** 更新密码生成器配置 */
  function updatePasswordGenerator(config: Partial<PasswordGeneratorConfig>): void {
    settings.value.passwordGenerator = {
      ...settings.value.passwordGenerator,
      ...config,
    };
    saveSettings(settings.value);
  }

  /** 更新用户名生成器配置 */
  function updateUsernameGenerator(config: Partial<UsernameGeneratorConfig>): void {
    settings.value.usernameGenerator = {
      ...settings.value.usernameGenerator,
      ...config,
    };
    saveSettings(settings.value);
  }

  /** 设置会话超时 */
  function setSessionTimeout(minutes: number): void {
    settings.value.sessionTimeout = minutes;
    saveSettings(settings.value);
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
  function resetToDefaults(): void {
    settings.value = { ...DEFAULT_SETTINGS };
    applyTheme();
    saveSettings(settings.value);
  }

  // 监听设置变化，自动保存
  watch(
    settings,
    (newSettings) => {
      saveSettings(newSettings);
    },
    { deep: true }
  );

  return {
    // State
    settings,
    
    // Getters
    effectiveTheme,
    isDark,
    passwordGenerator,
    usernameGenerator,
    
    // Actions
    setTheme,
    updatePasswordGenerator,
    updateUsernameGenerator,
    setSessionTimeout,
    applyTheme,
    initTheme,
    resetToDefaults,
  };
});
