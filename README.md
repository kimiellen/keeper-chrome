# Keeper Chrome

本地密码管理器的 Chrome 浏览器扩展，配合 [keeper](https://github.com/kimiellen/keeper) 后端服务使用。

## 项目架构

```
keeper-chrome (本扩展) ←────HTTP────→ keeper (后端服务)
     ↓                                      ↓
  Chrome 侧边面板                      本地数据库
```

所有密码数据存储在本地，通过 HTTP 与后端通信，不经过任何云服务。

## 技术栈

| 层级 | 技术 |
|------|------|
| 扩展框架 | [WXT](https://wxt.dev/) 0.21 |
| 前端框架 | Vue 3 + TypeScript |
| 状态管理 | Pinia |
| UI 组件库 | Element Plus |
| 构建工具 | Vite |
| 包管理器 | npm |

## 功能特性

### 侧边面板主界面
- **快捷键切换**: `Alt+.` 打开侧边面板
- **多关键词搜索**: 空格分隔多个关键词进行 AND 搜索
- **标签过滤**: 多选标签进行 AND 过滤
- **关联过滤**: 按联系人/关系过滤
- **快捷操作**: 
  - 单击打开书签网址
  - 复制用户名/密码
  - 多网址/多账号选择弹窗
  - 键盘导航 (上下箭头选择，回车确认)

### 自动填充
- **快捷键**: `Alt+P` 一键填充当前页面账号密码
- **智能表单检测**: 自动识别用户名/密码输入框
- **多账号选择**: 当站点有多个账号时显示下拉选择框
- **分步登录支持**: 支持用户名和密码分开输入的登录流程
- **按需解密**: 密码在使用时才向后端请求解密

### 登录捕获
- **自动检测**: 监听表单提交、按钮点击、Enter 键等登录行为
- **智能识别**: 排除搜索框、验证码、OTP 等非密码字段
- **通知提示**: 检测到新账号时顶部显示保存提示条
- **状态检查**: 自动检查账号是否已存在，避免重复提示
- **跨页面保持**: 登录后跳转页面仍可显示保存提示
- **可关闭**: 设置中可禁用登录捕获功能

### 数据库管理
- **多数据库支持**: 创建、切换、删除本地数据库文件
- **首次初始化**: 引导用户设置主密码和邮箱

### 数据导入导出
- **导出**: 导出为 JSON 格式备份
- **导入**: 支持 Keeper JSON 格式导入
- **冲突处理**: 支持跳过/重命名/覆盖策略

### 主题与设置
- **明暗主题**: 支持浅色/深色/跟随系统
- **会话超时**: 可设置自动锁定时间
- **隐藏锁定**: 可选关闭侧边面板时自动锁定

## 项目结构

```
keeper-chrome/
├── entrypoints/               # 扩展入口点
│   ├── sidepanel/             # 侧边面板主界面 (Vue SPA)
│   │   ├── main.ts            # Vue 应用入口
│   │   ├── App.vue            # 根组件（视图路由管理）
│   │   ├── index.html         # HTML 模板
│   │   └── views/
│   │       ├── Unlock.vue     # 解锁/登录视图
│   │       ├── Main.vue       # 书签列表主视图
│   │       ├── BookmarkEdit.vue  # 书签编辑视图
│   │       └── Settings.vue   # 设置视图
│   ├── popup/                 # 工具栏弹窗入口
│   │   ├── index.html
│   │   └── main.ts
│   ├── background.ts          # Service Worker (Chrome MV3)
│   ├── autofill.content.ts    # 内容脚本 - 自动填充
│   └── capture.content.ts     # 内容脚本 - 登录捕获
│
├── api/                       # Keeper API 客户端
│   ├── client.ts              # KeeperClient 类（完整 REST API）
│   ├── types.ts               # TypeScript 类型定义
│   └── __tests__/             # 测试文件
│
├── stores/                    # Pinia 状态管理
│   ├── auth.ts                # 认证状态（解锁/锁定）
│   ├── bookmarks.ts           # 书签 CRUD
│   ├── tags.ts                # 标签管理
│   ├── relations.ts           # 联系人/关系管理
│   ├── database.ts            # 数据库管理
│   └── settings.ts            # 用户设置（主题、生成器等）
│
├── utils/                     # 工具函数
│   └── tagColors.ts           # 标签颜色处理
│
├── public/                    # 静态资源
│   └── icons/                 # 扩展图标
│
├── wxt.config.ts              # WXT 扩展配置
├── package.json               # 依赖和脚本
└── tsconfig.json              # TypeScript 配置
```

## 安装与运行

### 前置条件

需要先在本机运行 keeper 后端服务，默认监听 `http://127.0.0.1:51000`。

### 从源码安装

```bash
# 克隆仓库
git clone https://github.com/kimiellen/keeper-chrome.git
cd keeper-chrome

# 安装依赖
npm install

# 开发模式（热重载）
npm run dev

# 生产构建
npm run build

# 打包为 zip（用于 Chrome Web Store 提交）
npm run zip
```

### 在 Chrome 中加载

构建完成后：

1. 打开 Chrome，访问 `chrome://extensions/`
2. 打开右上角"开发者模式"
3. 点击"加载已解压的扩展程序"
4. 选择 `.output/chrome-mv3/` 目录

## 权限说明

| 权限 | 用途 |
|------|------|
| `storage` | 存储会话 token 和用户设置 |
| `activeTab` | 获取当前标签页 URL 用于书签匹配 |
| `tabs` | 监听标签页切换、打开新标签页 |
| `notifications` | 显示通知 |
| `sidePanel` | 使用 Chrome 侧边面板功能 |
| `<all_urls>` | 自动填充和登录捕获需要访问任意页面 |

## 通信机制

### 后台脚本 (background.ts)
- 启动时从 `storage.local` 加载会话 token
- 响应快捷键命令（打开侧边面板、填充凭据）
- 管理待保存凭据状态（5分钟超时，存储在 `chrome.storage.session`）
- 配置 `chrome.sidePanel` 行为

### 内容脚本
- **autofill.content.ts**: 注入所有页面，处理自动填充逻辑
- **capture.content.ts**: 仅注入主页面（非 iframe），监听登录行为

### 消息类型

```typescript
// 认证相关
{ type: 'GET_AUTH_STATUS' }
{ type: 'GET_MATCHING_BOOKMARKS', payload: { url: string } }
{ type: 'GET_DECRYPTED_PASSWORD', payload: { bookmarkId: string, accountId: number } }

// 凭据保存
{ type: 'SAVE_CREDENTIALS', payload: { url: string, username: string, password: string } }
{ type: 'SAVE_PENDING_CREDENTIAL', payload: { url: string, hostname: string, username: string, password: string } }
{ type: 'GET_PENDING_CREDENTIAL' }
{ type: 'CLEAR_PENDING_CREDENTIAL' }

// 使用记录
{ type: 'MARK_AS_USED', payload: { bookmarkId: string, url?: string, accountId?: number } }
```

## 安全设计

### 本地通信
- 与后端通过 HTTP 在本地通信（`127.0.0.1:51000`）
- 使用 Bearer Token 进行身份验证
- Token 存储在 `chrome.storage.local`，后台脚本和侧边面板共享

### 密码处理
- 前端不存储任何密码明文
- 密码按需解密：使用时调用 `GET_DECRYPTED_PASSWORD` 获取
- 会话超时后自动锁定，Token 清除

### 内容脚本隔离
- 使用 Shadow DOM 渲染下拉选择框和通知条，避免样式冲突
- 动画效果支持 `prefers-reduced-motion` 无障碍设置

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Alt+.` | 打开 Keeper 侧边面板 |
| `Alt+P` | 填充当前页面账号密码 |

## API 端点

后端 API 基础地址：`http://127.0.0.1:51000/api`

主要端点：
- `POST /auth/unlock` - 解锁/登录
- `POST /auth/lock` - 锁定
- `GET /auth/status` - 检查会话状态
- `GET /bookmarks` - 获取书签列表
- `GET /bookmarks/:id?decrypt=true` - 获取单个书签（解密密码）
- `POST /bookmarks` - 创建书签
- `PATCH /bookmarks/:id` - 部分更新书签
- `GET /tags` - 获取标签列表
- `GET /relations` - 获取关系列表
- `GET /db/list` - 获取数据库列表
- `POST /db/open` - 切换数据库

## 开发

### 代码规范

- **Vue 组件**: 使用 `<script setup lang="ts">` 语法
- **命名**: 组件使用 PascalCase，组合式函数使用 `use` 前缀
- **状态管理**: 使用 Pinia 组合式 API 模式

### 测试

测试文件位于 `api/__tests__/` 目录，设计为在浏览器控制台中手动运行。

## 许可证

[MIT](LICENSE)
