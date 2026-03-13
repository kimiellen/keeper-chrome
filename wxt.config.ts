import { defineConfig } from 'wxt';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  vite: () => ({
    plugins: [vue()],
  }),
  manifest: {
    name: 'Keeper',
    version: '1.0.0',
    description: '密码管理器',
    permissions: [
      'storage',
      'activeTab',
      'contextMenus',
      'tabs',
      'sidePanel',
    ],
    host_permissions: [
      '<all_urls>'
    ],
    icons: {
      '32': 'icons/icon-32.png',
      '64': 'icons/icon-64.png',
      '128': 'icons/icon-128.png'
    },
    side_panel: {
      default_path: 'sidepanel.html',
    },
    action: {
      default_title: 'Keeper',
      default_icon: {
        '16': 'icons/toolbar-16.png',
        '32': 'icons/toolbar-32.png',
        '48': 'icons/toolbar-48.png'
      }
    },
    commands: {
      fill_credentials: {
        suggested_key: {
          default: 'Alt+P'
        },
        description: '填充账号密码'
      }
    }
  },
  browser: 'chrome'
});
