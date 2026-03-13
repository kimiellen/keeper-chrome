<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue';
import { useAuthStore } from '../../../stores/auth';
import { useDatabaseStore } from '../../../stores/database';
import { Check, Close, Folder, Plus } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';

const emit = defineEmits<{
  (e: 'unlocked'): void;
}>();

const authStore = useAuthStore();
const databaseStore = useDatabaseStore();
const password = ref('');
const isLoading = ref(false);
const error = ref('');
const activeTab = ref<string>('password');
const passwordInput = ref<InstanceType<typeof import('element-plus')['ElInput']> | null>(null);


const isSelectorOpen = ref(false);
const showOpenDbInput = ref(false);
const showCreateDbInput = ref(false);
const dbPathInput = ref('');
const showCreateDialog = ref(false);
const createForm = ref({
  email: '',
  password: '',
  confirmPassword: ''
});
const isCreating = ref(false);
const createError = ref('');

onMounted(async () => {
  await databaseStore.fetchList();
  const savedTab = localStorage.getItem('unlockTab');
  if (savedTab === 'password' || savedTab === 'fingerprint') {
    activeTab.value = savedTab;
  }
  nextTick(() => passwordInput.value?.focus());
  window.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.closest('input, button, a, [role="button"], [tabindex], .el-input, .el-button, .el-select, .el-dialog, .db-selector-container')) {
      return;
    }
    if (activeTab.value === 'password') {
      passwordInput.value?.focus();
    }
  });
});

// Tab 切换
function handleTabChange(tab: string) {
  activeTab.value = tab;
  localStorage.setItem('unlockTab', tab);
  if (tab === 'password') {
    nextTick(() => {
      passwordInput.value?.focus();
    });
  }
}

// 密码解锁
async function handleUnlock() {
  if (!password.value) {
    error.value = '请输入主密码';
    return;
  }

  isLoading.value = true;
  error.value = '';

  try {
    await authStore.unlock(password.value);
    const success = !authStore.locked;
    if (success) {
      emit('unlocked');
    } else {
      error.value = '密码错误';
    }
  } catch (e: any) {
    if (authStore.error) {
      error.value = authStore.error;
    } else if (e?.detail) {
      error.value = e.detail;
    } else if (e?.message) {
      error.value = e.message;
    } else {
      error.value = '解锁失败';
    }
  } finally {
    isLoading.value = false;
  }
}


// 数据库选择器方法
function toggleSelector() {
  isSelectorOpen.value = !isSelectorOpen.value;
  if (!isSelectorOpen.value) {
    showOpenDbInput.value = false;
    showCreateDbInput.value = false;
    dbPathInput.value = '';
  }
}

async function selectDatabase(path: string) {
  if (path === databaseStore.currentPath) {
    isSelectorOpen.value = false;
    return;
  }
  
  const success = await databaseStore.openDatabase(path);
  if (success) {
    authStore.reset();
    isSelectorOpen.value = false;
    ElMessage.success('数据库已切换');
  } else {
    ElMessage.error(databaseStore.error || '切换失败');
  }
}

function handleOpenDbClick() {
  showOpenDbInput.value = true;
  showCreateDbInput.value = false;
  dbPathInput.value = '';
}

async function submitOpenDb() {
  if (!dbPathInput.value) return;
  const success = await databaseStore.openDatabase(dbPathInput.value);
  if (success) {
    authStore.reset();
    isSelectorOpen.value = false;
    showOpenDbInput.value = false;
    ElMessage.success('数据库已打开');
  } else {
    ElMessage.error(databaseStore.error || '打开失败');
  }
}

function handleCreateDbClick() {
  showCreateDbInput.value = true;
  showOpenDbInput.value = false;
  dbPathInput.value = '';
}

async function handleRemoveDatabase(path: string, event: Event) {
  event.stopPropagation();
  const success = await databaseStore.removeDatabase(path);
  if (success) {
    ElMessage.success('已移除数据库关联');
  } else {
    ElMessage.error(databaseStore.error || '移除失败');
  }
}

function submitCreateDb() {
  if (!dbPathInput.value) return;
  showCreateDialog.value = true;
}

function cancelCreate() {
  showCreateDialog.value = false;
  createForm.value = { email: '', password: '', confirmPassword: '' };
  createError.value = '';
}

async function doCreateDatabase() {
  if (!createForm.value.email) {
    createError.value = '请输入邮箱';
    return;
  }
  if (!createForm.value.password) {
    createError.value = '请输入密码';
    return;
  }
  if (createForm.value.password !== createForm.value.confirmPassword) {
    createError.value = '两次输入的密码不一致';
    return;
  }

  isCreating.value = true;
  createError.value = '';

  try {
    const success = await databaseStore.createDatabase(
      dbPathInput.value,
      createForm.value.email,
      createForm.value.password,
    );

    if (success) {
      authStore.reset();
      cancelCreate();
      isSelectorOpen.value = false;
      showCreateDbInput.value = false;
      ElMessage.success('数据库已创建并打开');
    } else {
      createError.value = databaseStore.error || '创建失败';
    }
  } catch (e: any) {
    createError.value = e.message || '创建失败';
  } finally {
    isCreating.value = false;
  }
}

// 指纹解锁（暂不实现功能）
function handleFingerprint() {
  ElMessage.info('指纹解锁功能暂未实现');
}
</script>

<template>
  <div class="unlock-page">
    <div class="unlock-header">
      <h1>Keeper</h1>
    </div>

    <!-- Tabs - Element Plus -->
    <el-tabs
      v-model="activeTab"
      class="unlock-tabs"
      @tab-change="handleTabChange"
    >
      <el-tab-pane label="密码解锁" name="password">
        <form class="unlock-form" @submit.prevent="handleUnlock">
          <el-input
            ref="passwordInput"
            v-model="password"
            type="password"
            placeholder="请输入主密码"
            size="large"
            show-password
            @keyup.enter="handleUnlock"
          />

          <div v-if="error" class="error-message" style="white-space: pre-line">
            {{ error }}
          </div>

          <el-button
            type="primary"
            size="large"
            :loading="isLoading"
            class="unlock-button"
            native-type="submit"
          >
            {{ isLoading ? '解锁中...' : '解锁' }}
          </el-button>
        </form>
      </el-tab-pane>

      <el-tab-pane label="指纹解锁" name="fingerprint">
        <div class="fingerprint-content">
          <div class="fingerprint-icon">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M12 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"/>
              <path d="M10 12a6 6 0 0 0 4 2"/>
              <path d="M12 14v4"/>
              <circle cx="12" cy="9" r="2"/>
            </svg>
          </div>
          <p class="fingerprint-hint">点击使用指纹解锁</p>
          <el-button
            type="primary"
            size="large"
            class="unlock-button"
            @click="handleFingerprint"
          >
            使用指纹
          </el-button>
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- 数据库选择器 -->
    <div class="db-selector-container">
      <div class="db-selector-trigger" @click="toggleSelector">
        <span class="db-name">{{ databaseStore.currentName }}</span>
        <svg class="dropdown-icon" :class="{ 'is-open': isSelectorOpen }" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </div>

      <div v-show="isSelectorOpen" class="db-dropdown">
        <!-- 历史列表 -->
        <div class="db-list">
          <div 
            v-for="db in databaseStore.databases" 
            :key="db.path"
            class="db-item"
            :class="{ active: db.path === databaseStore.currentPath }"
            @click="selectDatabase(db.path)"
          >
            <el-icon v-if="db.path === databaseStore.currentPath" class="check-icon"><Check /></el-icon>
            <span v-else class="check-placeholder"></span>
            <span class="db-filename" :title="db.path">{{ db.name }}</span>
            <el-icon 
              v-if="db.path !== databaseStore.currentPath"
              class="remove-icon"
              @click="handleRemoveDatabase(db.path, $event)"
            >
              <Close />
            </el-icon>
          </div>
        </div>

        <div class="dropdown-divider"></div>

        <!-- 打开现有 -->
        <div v-if="!showOpenDbInput" class="db-action-item" @click="handleOpenDbClick">
          <el-icon><Folder /></el-icon>
          <span>选择数据库...</span>
        </div>
        <div v-else class="db-action-input">
          <el-input 
            v-model="dbPathInput" 
            placeholder="输入数据库文件路径" 
            size="small"
            @keyup.enter="submitOpenDb"
            autofocus
          >
            <template #suffix>
              <div class="input-action-buttons">
                <el-icon class="action-icon confirm-icon" @click="submitOpenDb" title="打开"><Check /></el-icon>
                <el-icon class="action-icon cancel-icon" @click="showOpenDbInput = false; dbPathInput = ''" title="取消"><Close /></el-icon>
              </div>
            </template>
          </el-input>
        </div>

        <div class="dropdown-divider"></div>

        <!-- 新建数据库 -->
        <div v-if="!showCreateDbInput" class="db-action-item" @click="handleCreateDbClick">
          <el-icon><Plus /></el-icon>
          <span>新建数据库...</span>
        </div>
        <div v-else class="db-action-input">
          <el-input 
            v-model="dbPathInput" 
            placeholder="输入新数据库文件路径" 
            size="small"
            @keyup.enter="submitCreateDb"
            autofocus
          >
            <template #suffix>
              <div class="input-action-buttons">
                <el-icon class="action-icon confirm-icon" @click="submitCreateDb" title="新建"><Check /></el-icon>
                <el-icon class="action-icon cancel-icon" @click="showCreateDbInput = false; dbPathInput = ''" title="取消"><Close /></el-icon>
              </div>
            </template>
          </el-input>
        </div>
      </div>
    </div>

    <!-- 创建数据库对话框 -->
    <el-dialog
      v-model="showCreateDialog"
      title="设置主密码"
      width="90%"
      class="create-db-dialog"
      :show-close="false"
      align-center
    >
      <div class="create-form">
        <el-input
          v-model="createForm.email"
          placeholder="邮箱账号"
          size="large"
          type="email"
        />
        <el-input
          v-model="createForm.password"
          placeholder="主密码"
          size="large"
          type="password"
          show-password
        />
        <el-input
          v-model="createForm.confirmPassword"
          placeholder="确认主密码"
          size="large"
          type="password"
          show-password
          @keyup.enter="doCreateDatabase"
        />
        <div v-if="createError" class="error-message dialog-error">
          {{ createError }}
        </div>
      </div>
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="cancelCreate" :disabled="isCreating">取消</el-button>
          <el-button type="primary" @click="doCreateDatabase" :loading="isCreating">
            创建
          </el-button>
        </div>
      </template>
    </el-dialog>

  </div>
</template>

<style scoped>
.unlock-page {
  padding: 32px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.unlock-header {
  text-align: center;
  margin-bottom: 28px;
}

.unlock-header h1 {
  font-size: 24px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
}

/* Element Plus Tabs 样式覆盖 */
.unlock-tabs {
  width: 100%;
}

.unlock-tabs :deep(.el-tabs__nav-wrap::after) {
  display: none;
}

.unlock-tabs :deep(.el-tabs__nav) {
  width: 100%;
  justify-content: center;
}

.unlock-tabs :deep(.el-tabs__active-bar) {
  background-color: var(--color-accent);
}

.unlock-tabs :deep(.el-tabs__item) {
  color: var(--color-text-tertiary);
  font-size: 14px;
}

.unlock-tabs :deep(.el-tabs__item.is-active) {
  color: var(--color-accent);
  font-weight: 500;
}

.unlock-tabs :deep(.el-tabs__item:hover) {
  color: var(--color-accent);
}

/* 表单 */
.unlock-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 8px;
}

.error-message {
  color: var(--color-accent);
  font-size: 13px;
  text-align: center;
}

.unlock-button {
  width: 100%;
  --el-button-bg-color: var(--color-accent);
  --el-button-border-color: var(--color-accent);
  --el-button-hover-bg-color: var(--color-accent-hover);
  --el-button-hover-border-color: var(--color-accent-hover);
  --el-button-active-bg-color: var(--color-accent-hover);
  --el-button-active-border-color: var(--color-accent-hover);
}

/* 指纹区域 */
.fingerprint-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 24px 0;
}

.fingerprint-icon {
  color: var(--color-text-tertiary);
  margin-bottom: 16px;
}

.fingerprint-hint {
  font-size: 14px;
  color: var(--color-text-secondary);
  margin-bottom: 20px;
}

/* Element Plus 输入框主题适配 */
.unlock-form :deep(.el-input__wrapper) {
  background-color: var(--color-input-bg);
  border-radius: 8px;
}

.unlock-form :deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 1px var(--color-accent) inset;
}


/* 数据库选择器 */
.db-selector-container {
  width: 100%;
  margin-top: 16px;
  position: relative;
}

.db-selector-trigger {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 8px;
  cursor: pointer;
  color: var(--color-text-secondary);
  font-size: 14px;
  border-radius: 6px;
  transition: background-color 0.2s;
}

.db-selector-trigger:hover {
  background-color: var(--color-bg-hover);
  color: var(--color-text-primary);
}

.db-name {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dropdown-icon {
  transition: transform 0.2s;
}

.dropdown-icon.is-open {
  transform: rotate(180deg);
}

.db-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 4px;
  background-color: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  z-index: 100;
  padding: 8px 0;
}

.db-list {
  max-height: 150px;
  overflow-y: auto;
}

.db-item {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  cursor: pointer;
  font-size: 14px;
  color: var(--color-text-primary);
}

.db-item:hover {
  background-color: var(--color-bg-hover);
}

.db-item.active {
  color: var(--color-accent);
}

.check-icon {
  margin-right: 8px;
  font-size: 14px;
  display: inline-flex;
}

.check-placeholder {
  width: 22px;
  display: inline-block;
}

.db-filename {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.remove-icon {
  font-size: 14px;
  color: var(--color-text-tertiary);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s, color 0.2s;
}

.db-item:hover .remove-icon {
  opacity: 1;
}

.remove-icon:hover {
  color: var(--color-accent);
}

.dropdown-divider {
  height: 1px;
  background-color: var(--color-border);
  margin: 4px 0;
}

.db-action-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  font-size: 14px;
  color: var(--color-text-secondary);
}

.db-action-item:hover {
  background-color: var(--color-bg-hover);
  color: var(--color-text-primary);
}

.db-action-input {
  padding: 8px 12px;
}

.input-action-buttons {
  display: flex;
  align-items: center;
  gap: 4px;
}

.action-icon {
  font-size: 16px;
  cursor: pointer;
  border-radius: 4px;
  padding: 2px;
  transition: color 0.2s, background-color 0.2s;
}

.confirm-icon {
  color: var(--color-text-secondary);
}

.confirm-icon:hover {
  color: var(--el-color-success, #67c23a);
  background-color: var(--color-bg-hover);
}

.cancel-icon {
  color: var(--color-text-secondary);
}

.cancel-icon:hover {
  color: var(--color-accent);
  background-color: var(--color-bg-hover);
}

/* 创建对话框 */
.create-db-dialog :deep(.el-dialog__body) {
  padding-top: 10px;
  padding-bottom: 10px;
}

.create-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.dialog-error {
  text-align: left;
  margin-top: -8px;
}

</style>
