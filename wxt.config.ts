import { defineConfig } from 'wxt';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  vite: () => ({
    plugins: [vue()],
  }),
  manifest: {
    name: 'Keeper',
    version: '0.26.4',
    description: '密码管理器',
    permissions: [
      'storage',
      'activeTab',
      'tabs',
      'notifications',
      'sidePanel',
      '<all_urls>',
    ],
    icons: {
      '32': 'icons/icon-32.png',
      '64': 'icons/icon-64.png',
      '128': 'icons/icon-128.png',
    },
    side_panel: {
      default_path: 'sidepanel.html',
    },
    commands: {
      toggle_sidebar: {
        suggested_key: {
          default: 'Alt+Period',
        },
        description: '切换 Keeper 侧边栏',
      },
      fill_credentials: {
        suggested_key: {
          default: 'Alt+P',
        },
        description: '填充账号密码',
      },
    },
  },
  browser: 'chrome',
});
