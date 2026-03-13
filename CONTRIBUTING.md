# Keeper 开发规范

**版本**：v1.0.0  
**最后更新**：2026-03-06  
**适用范围**：keeper（后端）+ keeper-firefox（前端）

---

## 目录

1. [开发环境配置](#开发环境配置)
2. [代码风格](#代码风格)
3. [Git 工作流](#git-工作流)
4. [提交规范](#提交规范)
5. [分支策略](#分支策略)
6. [测试规范](#测试规范)
7. [文档规范](#文档规范)
8. [安全规范](#安全规范)

---

## 开发环境配置

### 后端（keeper）

**系统要求**：
- Python 3.14+
- uv 包管理器
- mkcert（HTTPS 证书生成）

**初始化**：
```bash
cd ~/workspace/projects/keeper

# 安装 uv（如果未安装）
curl -LsSf https://astral.sh/uv/install.sh | sh

# 安装依赖
uv sync

# 激活虚拟环境
source .venv/bin/activate

# 生成本地 HTTPS 证书
mkdir -p certs
mkcert -install
mkcert -key-file certs/localhost-key.pem -cert-file certs/localhost.pem localhost 127.0.0.1 ::1

# 运行开发服务器
uvicorn src.main:app --host 127.0.0.1 --port 8443 --reload \
  --ssl-keyfile certs/localhost-key.pem \
  --ssl-certfile certs/localhost.pem
```

---

### 前端（keeper-firefox）

**系统要求**：
- Node.js 18+
- pnpm（推荐）或 npm

**初始化**：
```bash
cd ~/workspace/projects/keeper-firefox

# 安装 pnpm（如果未安装）
npm install -g pnpm

# 安装依赖
pnpm install

# 开发模式（热重载）
pnpm dev

# 构建生产版本
pnpm build

# 在 Firefox 中加载扩展
# 1. 访问 about:debugging#/runtime/this-firefox
# 2. 点击"临时载入附加组件"
# 3. 选择 .output/firefox-mv2/manifest.json
```

---

## 代码风格

### Python（后端）

**格式化工具**：
- `black`（88 字符宽度）
- `ruff`（linting + import sorting）

**配置**（`pyproject.toml`）：
```toml
[tool.black]
line-length = 88
target-version = ['py314']

[tool.ruff]
line-length = 88
select = ["E", "F", "I", "N", "UP", "S"]
ignore = ["E501"]  # black 已处理行长度

[tool.ruff.per-file-ignores]
"tests/*" = ["S101"]  # 允许测试中使用 assert
```

**运行检查**：
```bash
# 格式化代码
black src/ tests/

# Linting
ruff check src/ tests/ --fix

# 类型检查
mypy src/
```

**命名约定**：
```python
# ✅ 正确
class BookmarkRepository:          # 类：PascalCase
    def get_by_id(self, id: str):  # 方法：snake_case
        pass

API_VERSION = "v1"                 # 常量：UPPER_SNAKE_CASE
user_key = derive_key(password)    # 变量：snake_case

# ❌ 错误
class bookmark_repository:         # 应为 PascalCase
    def GetById(self, id: str):    # 应为 snake_case
        pass
```

**类型提示**（强制）：
```python
# ✅ 必须提供类型提示
from typing import Optional, List

def create_bookmark(
    name: str,
    urls: List[str],
    tag_ids: Optional[List[int]] = None
) -> Bookmark:
    pass

# ❌ 禁止省略类型
def create_bookmark(name, urls, tag_ids=None):
    pass
```

**异步优先**：
```python
# ✅ I/O 操作必须使用 async/await
async def get_bookmark(bookmark_id: str) -> Optional[Bookmark]:
    async with get_db_connection() as conn:
        result = await conn.execute(
            "SELECT * FROM bookmarks WHERE id = ?", (bookmark_id,)
        )
        return result.fetchone()

# ❌ 禁止阻塞式 I/O
def get_bookmark(bookmark_id: str) -> Optional[Bookmark]:
    conn = sqlite3.connect("keeper.db")  # 阻塞
    result = conn.execute("SELECT * FROM bookmarks WHERE id = ?", (bookmark_id,))
    return result.fetchone()
```

---

### TypeScript（前端）

**格式化工具**：
- ESLint
- Prettier

**配置**（`.eslintrc.cjs`）：
```javascript
module.exports = {
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:vue/vue3-recommended',
    'prettier'
  ],
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'vue/multi-word-component-names': 'off'
  }
}
```

**运行检查**：
```bash
# Linting
pnpm lint

# 格式化
pnpm format

# 类型检查
pnpm type-check
```

**命名约定**：
```typescript
// ✅ 正确
export interface Bookmark {        // 接口/类型：PascalCase
  id: string;
  tagIds: number[];                // 字段：camelCase
}

export class BookmarkService {     // 类：PascalCase
  async getById(id: string) {}     // 方法：camelCase
}

export const API_BASE_URL = "..."; // 常量：UPPER_SNAKE_CASE
const userKey = deriveKey();       // 变量：camelCase

// ❌ 错误
export interface bookmark {}       // 应为 PascalCase
export const apiBaseUrl = "...";   // 常量应为 UPPER_SNAKE_CASE
```

**组件命名**：
```vue
<!-- ✅ 正确：PascalCase 文件名 + 多单词 -->
<!-- BookmarkList.vue -->
<script setup lang="ts">
defineOptions({ name: 'BookmarkList' })
</script>

<!-- ❌ 错误：单单词组件名 -->
<!-- List.vue -->
```

**组合式函数**：
```typescript
// ✅ 正确：use 前缀 + camelCase
// composables/useAuth.ts
export function useAuth() {
  const isAuthenticated = ref(false)
  const login = async (password: string) => { ... }
  return { isAuthenticated, login }
}

// ❌ 错误：缺少 use 前缀
export function auth() { ... }
```

---

## Git 工作流

### 克隆与初始化

```bash
# 克隆仓库
git clone https://github.com/kimiellen/keeper.git
git clone https://github.com/kimiellen/keeper-firefox.git

# 配置用户信息（首次）
git config user.name "kimiellen"
git config user.email "beginner.zealots@gmail.com"
```

---

### 日常开发流程

```bash
# 1. 创建功能分支
git checkout -b feat/bookmark-crud

# 2. 进行开发
# ... 编辑代码 ...

# 3. 检查修改
git status
git diff

# 4. 暂存修改
git add src/routers/bookmarks.py

# 5. 提交（遵循提交规范）
git commit -m "feat(bookmark): implement CRUD endpoints"

# 6. 推送到远程
git push origin feat/bookmark-crud

# 7. 创建 Pull Request（可选，单人开发可直接合并）
gh pr create --title "Implement Bookmark CRUD" --body "..."

# 8. 合并到 main
git checkout main
git merge feat/bookmark-crud
git push origin main

# 9. 删除功能分支
git branch -d feat/bookmark-crud
git push origin --delete feat/bookmark-crud
```

---

## 提交规范

### 提交信息格式

```
<type>(<scope>): <subject>

[optional body]

[optional footer]
```

**示例**：
```
feat(auth): implement Argon2id key derivation

- Add argon2-cffi dependency
- Implement derive_master_key() function
- Add unit tests for key derivation

Closes #12
```

---

### Type（类型）

| Type | 说明 | 示例 |
|------|------|------|
| `feat` | 新功能 | `feat(bookmark): add search endpoint` |
| `fix` | Bug 修复 | `fix(auth): resolve token expiration issue` |
| `docs` | 文档更新 | `docs(schema): update JSON examples` |
| `style` | 代码格式（不影响逻辑） | `style(api): format with black` |
| `refactor` | 重构 | `refactor(crypto): extract HKDF to separate module` |
| `test` | 测试 | `test(bookmark): add CRUD integration tests` |
| `chore` | 构建/工具 | `chore(deps): update fastapi to 0.110.0` |
| `perf` | 性能优化 | `perf(search): add index on pinyin_initials` |
| `ci` | CI/CD 配置 | `ci: add GitHub Actions workflow` |

---

### Scope（范围）

**后端（keeper）**：
- `auth` - 认证模块
- `bookmark` - 书签 CRUD
- `tag` - 标签管理
- `relation` - 关联管理
- `crypto` - 加密模块
- `db` - 数据库相关
- `api` - API 路由

**前端（keeper-firefox）**：
- `popup` - 弹出窗口
- `background` - 后台脚本
- `content` - 内容脚本
- `composable` - 组合式函数
- `ui` - UI 组件
- `store` - 状态管理

---

### Subject（主题）

- 使用祈使句（"add" 而非 "added"）
- 首字母小写
- 不超过 50 字符
- 不以句号结尾

```bash
# ✅ 正确
git commit -m "feat(auth): implement user registration"
git commit -m "fix(bookmark): resolve tag deletion cascade"

# ❌ 错误
git commit -m "feat(auth): Implemented user registration."  # 首字母大写 + 句号
git commit -m "fix(bookmark): fixed the bug"                # 过去式
```

---

### Body（正文）

- 详细描述 **为什么** 而非 **是什么**
- 每行不超过 72 字符
- 与主题之间空一行

```
feat(crypto): implement AES-256-GCM encryption

Use AES-GCM instead of AES-CBC+HMAC to simplify implementation
and align with modern best practices. GCM provides both
confidentiality and authenticity in a single operation.

Technical details:
- 96-bit nonce (randomly generated)
- 128-bit authentication tag
- Base64 encoding for storage
```

---

### Footer（页脚）

**关联 Issue**：
```
Closes #42
Fixes #123
Refs #456
```

**Breaking Changes**：
```
BREAKING CHANGE: API endpoint renamed from /bookmarks to /api/v1/bookmarks
```

---

## 分支策略

### 主分支

**main**：
- 稳定版本
- 每个 Phase 完成后合并
- 受保护（禁止直接 push）

---

### 开发分支（按阶段）

**Phase 分支**：
- `phase-1-infrastructure` ✅ 已完成
- `phase-2-backend-core` ⏳ 进行中
- `phase-3-frontend-core`
- `phase-4-core-scenarios`
- `phase-5-auxiliary-features`
- `phase-6-security-hardening`

**合并规则**：
- Phase 完成后合并到 `main`
- 必须通过所有测试
- 必须更新文档

---

### 功能分支（可选）

**命名格式**：`<type>/<short-description>`

**示例**：
```bash
feat/argon2-encryption
fix/tag-deletion-cascade
docs/api-documentation
refactor/crypto-module
```

**生命周期**：
- 从当前 Phase 分支创建
- 完成后合并回 Phase 分支
- 合并后立即删除

---

## 测试规范

### 后端测试

**工具**：pytest + pytest-asyncio + httpx

**目录结构**：
```
tests/
├── conftest.py              # 测试配置和 fixtures
├── unit/
│   ├── test_crypto.py       # 加密模块单元测试
│   ├── test_models.py       # 数据模型测试
│   └── test_utils.py
├── integration/
│   ├── test_auth_api.py     # 认证 API 集成测试
│   ├── test_bookmark_api.py
│   └── test_tag_api.py
└── e2e/
    └── test_user_flow.py    # 端到端测试
```

**运行测试**：
```bash
# 所有测试
pytest

# 指定目录
pytest tests/unit/

# 覆盖率报告
pytest --cov=src --cov-report=html

# 快速失败
pytest -x

# 详细输出
pytest -v
```

**测试示例**：
```python
# tests/unit/test_crypto.py
import pytest
from src.crypto.argon2 import derive_master_key

class TestArgon2:
    def test_derive_master_key_returns_32_bytes(self):
        key = derive_master_key("test_password", "user@example.com")
        assert len(key) == 32
    
    def test_same_password_produces_same_key(self):
        key1 = derive_master_key("password", "email@test.com")
        key2 = derive_master_key("password", "email@test.com")
        assert key1 == key2
    
    def test_different_salt_produces_different_key(self):
        key1 = derive_master_key("password", "user1@test.com")
        key2 = derive_master_key("password", "user2@test.com")
        assert key1 != key2
```

**覆盖率要求**：
- 核心模块（crypto, auth）：> 90%
- API 路由：> 80%
- 工具函数：> 70%

---

### 前端测试

**工具**：Vitest + @vue/test-utils + Playwright（E2E）

**目录结构**：
```
src/
├── components/
│   ├── BookmarkList.vue
│   └── __tests__/
│       └── BookmarkList.test.ts
├── composables/
│   ├── useAuth.ts
│   └── __tests__/
│       └── useAuth.test.ts
└── api/
    ├── client.ts
    └── __tests__/
        └── client.test.ts
```

**运行测试**：
```bash
# 单元测试
pnpm test

# 监听模式
pnpm test:watch

# 覆盖率
pnpm test:coverage

# E2E 测试
pnpm test:e2e
```

**测试示例**：
```typescript
// src/composables/__tests__/useAuth.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useAuth } from '../useAuth'

describe('useAuth', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('should initialize as unauthenticated', () => {
    const { isAuthenticated } = useAuth()
    expect(isAuthenticated.value).toBe(false)
  })

  it('should set authenticated after successful login', async () => {
    const { login, isAuthenticated } = useAuth()
    await login('test_password')
    expect(isAuthenticated.value).toBe(true)
  })
})
```

---

## 文档规范

### 语言约束

- 文档内容用中文编写
- 文件名用英文编写

### 文档同步

- keeper（后端）和 keeper-firefox（前端）为前后端分离项目
- 当前阶段以后端（keeper）为主进行开发，会话产生的过程文档（如阶段交互记录、schema、ROADMAP 等）需同步到 keeper-firefox 项目的对应目录下

### 文档类型

| 文档 | 位置 | 更新时机 |
|------|------|---------|
| README.md | 项目根目录 | 功能变更时 |
| schema.md | docs/ | 数据结构变更时 |
| api.md | docs/ | API 变更时 |
| 阶段交互记录 | docs/ | 每个 Phase 结束时 |
| CONTRIBUTING.md | 项目根目录 | 规范变更时 |

---

### Markdown 规范

**标题层级**：
```markdown
# 一级标题（每个文档只有一个）
## 二级标题
### 三级标题
#### 四级标题（尽量避免更深层级）
```

**代码块**：
````markdown
```python
# 必须指定语言
def example():
    pass
```
````

**表格**：
```markdown
| 列1 | 列2 | 列3 |
|-----|-----|-----|
| 内容 | 内容 | 内容 |
```

**链接**：
```markdown
[相对链接](./docs/schema.md)
[绝对链接](https://github.com/kimiellen/keeper)
```

---

### API 文档

**端点格式**：
```markdown
### POST /api/v1/auth/login

**描述**：用户登录，返回 JWT token

**请求头**：
- `Content-Type: application/json`
- `X-Keeper-Secret: <pre_shared_key>`

**请求体**：
```json
{
  "email": "user@example.com",
  "masterPasswordHash": "argon2id$..."
}
```

**响应**（200 OK）：
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": 3600
  }
}
```

**错误响应**（401 Unauthorized）：
```json
{
  "success": false,
  "error": {
    "code": "INVALID_PASSWORD",
    "message": "密码不正确"
  }
}
```
```

---

## 安全规范

### 敏感数据处理

**禁止提交**：
- `.env` 文件（包含密钥）
- `certs/*.pem`（HTTPS 证书）
- `*.db`（数据库文件）
- `*.log`（日志文件）

**检查 .gitignore**：
```bash
# .gitignore（keeper）
.env
certs/*.pem
*.db
*.db-journal
*.log
__pycache__/
.venv/

# .gitignore（keeper-firefox）
.env
.output/
node_modules/
*.log
```

---

### 代码审查要点

**加密相关**：
- [ ] 敏感数据是否加密后存储？
- [ ] 是否使用安全的随机数生成器（`os.urandom`）？
- [ ] 密钥是否在使用后清零？

**API 安全**：
- [ ] 是否验证所有输入？
- [ ] 是否使用参数化查询（防止 SQL 注入）？
- [ ] 是否限制 CORS？

**前端安全**：
- [ ] 是否验证证书指纹？
- [ ] 是否在超时后清理内存？
- [ ] 是否使用 `browser.storage.session`（而非 localStorage）？

---

### 漏洞报告

**发现安全问题**：
1. **不要**公开提交 Issue
2. 发送邮件到：`beginner.zealots@gmail.com`
3. 标题：`[SECURITY] <简短描述>`
4. 提供：
   - 漏洞描述
   - 复现步骤
   - 影响范围
   - 修复建议（可选）

---

## 附录

### 常用命令速查

**后端**：
```bash
# 运行开发服务器
uvicorn src.main:app --reload --host 127.0.0.1 --port 8443 \
  --ssl-keyfile certs/localhost-key.pem \
  --ssl-certfile certs/localhost.pem

# 格式化 + Linting
black src/ && ruff check src/ --fix

# 运行测试
pytest --cov=src

# 添加依赖
uv add fastapi
```

**前端**：
```bash
# 开发模式
pnpm dev

# 构建
pnpm build

# Linting
pnpm lint --fix

# 测试
pnpm test
```

**Git**：
```bash
# 查看当前分支
git branch

# 切换分支
git checkout phase-2-backend-core

# 创建并切换分支
git checkout -b feat/new-feature

# 查看提交历史
git log --oneline --graph

# 撤销未提交的修改
git checkout -- <file>

# 修改最后一次提交
git commit --amend
```

---

### 问题排查

**问题：uv 找不到命令**
```bash
# 解决：重新安装 uv
curl -LsSf https://astral.sh/uv/install.sh | sh
source ~/.bashrc
```

**问题：mkcert 证书不受信任**
```bash
# 解决：重新安装 CA
mkcert -uninstall
mkcert -install
```

**问题：Firefox 扩展加载失败**
```bash
# 解决：检查构建输出
pnpm build
ls -la .output/firefox-mv2/
# 确保 manifest.json 存在
```

---

**版本历史**：
- v1.0.0 (2026-03-06) - 初始版本
