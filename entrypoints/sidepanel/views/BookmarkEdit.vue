<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useBookmarksStore } from '../../../stores/bookmarks';
import { useTagsStore } from '../../../stores/tags';
import { useRelationsStore } from '../../../stores/relations';
import { useSettingsStore } from '../../../stores/settings';
import type { Bookmark } from '../../../api/types';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Back, Close, Plus, Delete } from '@element-plus/icons-vue';
import { toSoftBackground } from '../../../utils/tagColors';

const props = defineProps<{
  bookmark: Bookmark | null;
}>();

const emit = defineEmits<{
  (e: 'saved'): void;
  (e: 'cancel'): void;
}>();

const bookmarksStore = useBookmarksStore();
const tagsStore = useTagsStore();
const relationsStore = useRelationsStore();
const settingsStore = useSettingsStore();

const isLoading = ref(false);
const isDeleting = ref(false);
const isEdit = computed(() => !!props.bookmark);

function formatDateTime(dateStr?: string): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// 表单数据
const name = ref('');
const notes = ref('');
const selectedTags = ref<number[]>([]);
const selectedRelations = ref<number[]>([]);
const urls = ref<{ url: string; lastUsed?: string }[]>([{ url: '' }]);
const accounts = ref<{ username: string; password: string; relatedIds?: number[] }[]>([{ username: '', password: '' }]);

function getTagColor(tagId: number): string {
  const tag = tagsStore.tags.find(t => t.id === tagId);
  return tag?.color || '#9CA3AF';
}

function getTagName(tagId: number): string {
  const tag = tagsStore.tags.find(t => t.id === tagId);
  return tag?.name || String(tagId);
}

// 初始化
onMounted(async () => {
  await Promise.all([
    tagsStore.fetchTags(),
    relationsStore.fetchRelations()
  ]);
  
  if (props.bookmark) {
    name.value = props.bookmark.name || '';
    notes.value = props.bookmark.notes || '';
    selectedTags.value = props.bookmark.tagIds || [];
    urls.value = props.bookmark.urls?.length ? [...props.bookmark.urls] : [{ url: '' }];

    if (props.bookmark.accounts?.length) {
      accounts.value = props.bookmark.accounts.map(a => ({
        username: a.username,
        password: a.password,
      }));

      if (props.bookmark.accounts[0].relatedIds) {
        selectedRelations.value = [...props.bookmark.accounts[0].relatedIds];
      }
    } else {
      accounts.value = [{ username: '', password: '' }];
    }
  }
});

// 添加网址
function addUrl() {
  urls.value.push({ url: '' });
}

// 删除网址
function removeUrl(index: number) {
  urls.value.splice(index, 1);
  if (urls.value.length === 0) {
    urls.value.push({ url: '' });
  }
}

// 添加账号
function addAccount() {
  accounts.value.push({ username: '', password: '' });
}

// 删除账号
function removeAccount(index: number) {
  accounts.value.splice(index, 1);
  if (accounts.value.length === 0) {
    accounts.value.push({ username: '', password: '' });
  }
}

function generateUsernameFor(index: number) {
  const config = settingsStore.usernameGenerator;
  const consonants = 'bcdfghjklmnpqrstvwxyz';
  const vowels = 'aeiou';
  const length = 6 + Math.floor(Math.random() * 7); // 6-12 length
  let word = '';
  
  for (let i = 0; i < length; i++) {
    if (i % 2 === 0) {
      word += consonants[Math.floor(Math.random() * consonants.length)];
    } else {
      word += vowels[Math.floor(Math.random() * vowels.length)];
    }
  }
  
  if (config.includeNumbers) {
    const num = Math.floor(Math.random() * 900) + 100; // 100-999
    word += num.toString();
  }
  
  accounts.value[index].username = word;
}

function generatePasswordFor(index: number) {
  const config = settingsStore.passwordGenerator;
  let charset = '';
  if (config.includeLowercase) charset += 'abcdefghijklmnopqrstuvwxyz';
  if (config.includeUppercase) charset += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  if (config.includeNumbers) charset += '0123456789';
  if (config.includeSpecial) charset += '!@#$%^&*()_+-=[]{}|;:,.<>?';
  
  if (!charset) charset = 'abcdefghijklmnopqrstuvwxyz';
  
  let password = '';
  const array = new Uint32Array(config.length);
  crypto.getRandomValues(array);
  
  for (let i = 0; i < config.length; i++) {
    password += charset[array[i] % charset.length];
  }
  
  accounts.value[index].password = password;
}

function buildAccounts(
  rawAccounts: { username: string; password: string }[]
): { username: string; password: string; relatedIds: number[] }[] {
  return rawAccounts.map(a => ({
    username: a.username.trim(),
    password: a.password.trim(),
    relatedIds: selectedRelations.value,
  }));
}

// 保存
async function handleSave() {
  if (!name.value.trim()) {
    ElMessage.warning('名称不能为空');
    return;
  }

  isLoading.value = true;

  try {
    const filteredAccounts = accounts.value.filter(a => a.username.trim() || a.password.trim());
    const builtAccounts = filteredAccounts.length > 0
      ? buildAccounts(filteredAccounts)
      : [];

    const bookmarkData = {
      name: name.value.trim(),
      notes: notes.value.trim() || undefined,
      tagIds: selectedTags.value,
      urls: urls.value.filter(u => u.url.trim()).map(u => ({
        url: u.url.trim(),
        lastUsed: u.lastUsed
      })),
      accounts: builtAccounts,
    };

    if (isEdit.value && props.bookmark?.id) {
      const result = await bookmarksStore.updateBookmark(props.bookmark.id, bookmarkData);
      if (!result) {
        ElMessage.error(bookmarksStore.error || '保存失败');
        return;
      }
      ElMessage.success('保存成功');
    } else {
      const result = await bookmarksStore.createBookmark(bookmarkData);
      if (!result) {
        ElMessage.error(bookmarksStore.error || '添加失败');
        return;
      }
      ElMessage.success('添加成功');
    }

    emit('saved');
  } catch (e) {
    console.error('保存失败', e);
    ElMessage.error('保存失败');
  } finally {
    isLoading.value = false;
  }
}

// 删除
async function handleDelete() {
  if (!props.bookmark?.id) return;

  try {
    await ElMessageBox.confirm(
      '确定要删除该书签吗？此操作不可撤销。',
      '删除确认',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning',
        confirmButtonClass: 'el-button--danger',
      }
    );
  } catch {
    return; // 用户取消
  }

  isDeleting.value = true;
  try {
    const result = await bookmarksStore.deleteBookmark(props.bookmark.id);
    if (!result) {
      ElMessage.error(bookmarksStore.error || '删除失败');
      return;
    }
    ElMessage.success('删除成功');
    emit('saved');
  } catch (e) {
    console.error('删除失败', e);
    ElMessage.error('删除失败');
  } finally {
    isDeleting.value = false;
  }
}
</script>

<template>
  <div class="bookmark-edit">
    <!-- 头部 -->
    <div class="edit-header">
      <el-button class="back-btn" :icon="Back" circle text @click="emit('cancel')" />
      <h2>{{ isEdit ? '编辑书签' : '新增书签' }}</h2>
      <el-button type="primary" plain class="save-btn" size="small" :loading="isLoading" @click="handleSave">
        保存
      </el-button>
    </div>

    <!-- 表单 -->
    <div class="edit-form">
      <!-- 名称 -->
      <div class="form-group">
        <label>名称 <span class="required">*</span></label>
        <el-input
          v-model="name"
          placeholder="请输入名称"
        />
      </div>

      <!-- 网址 -->
      <div class="form-group">
        <label>网址</label>
        <div class="url-list-container">
          <el-scrollbar max-height="200px">
            <div class="url-list">
              <div v-for="(urlObj, index) in urls" :key="index" class="url-item">
                <el-input
                  v-model="urlObj.url"
                  placeholder="https://"
                  class="url-input"
                />
                <el-button v-if="urls.length > 1" type="danger" :icon="Close" circle text @click="removeUrl(index)" />
              </div>
            </div>
          </el-scrollbar>
          <el-button class="add-btn" :icon="Plus" plain @click="addUrl">添加网址</el-button>
        </div>
      </div>

      <!-- 账号 -->
      <div class="form-group">
        <label>账号</label>
        <div class="account-list-container">
          <el-scrollbar max-height="200px">
            <div class="account-list">
              <div v-for="(account, index) in accounts" :key="index" class="account-item">
                <div class="account-fields">
                  <el-input
                    v-model="account.username"
                    placeholder="用户名"
                  >
                    <template #append>
                      <el-button @click="generateUsernameFor(index)">生成</el-button>
                    </template>
                  </el-input>
                  
                  <el-input
                    v-model="account.password"
                    type="password"
                    placeholder="密码"
                    show-password
                  >
                    <template #append>
                      <el-button @click="generatePasswordFor(index)">生成</el-button>
                    </template>
                  </el-input>
                </div>

                <el-button v-if="accounts.length > 1" type="danger" :icon="Close" circle text class="remove-account-btn" @click="removeAccount(index)" />
              </div>
            </div>
          </el-scrollbar>
          <el-button class="add-btn" :icon="Plus" plain @click="addAccount">添加账号</el-button>
        </div>
      </div>
      
      <!-- 标签 -->
      <div class="form-group">
        <label>标签</label>
        <el-select
          v-model="selectedTags"
          multiple
          filterable
          placeholder="请选择标签"
          class="full-width"
        >
          <el-option
            v-for="tag in tagsStore.tags"
            :key="tag.id"
            :label="tag.name"
            :value="tag.id"
          >
            <span class="tag-option">
              <span class="tag-color-dot" :style="{ backgroundColor: getTagColor(tag.id) }"></span>
              {{ tag.name }}
            </span>
          </el-option>
          <template #tag>
            <el-tag
              v-for="tagId in selectedTags"
              :key="tagId"
              effect="plain"
              :style="{
                '--el-tag-bg-color': toSoftBackground(getTagColor(tagId)),
                '--el-tag-border-color': getTagColor(tagId),
                '--el-tag-text-color': getTagColor(tagId),
                '--el-tag-hover-color': getTagColor(tagId),
              }"
              closable
              @close="selectedTags = selectedTags.filter(id => id !== tagId)"
            >
              {{ getTagName(tagId) }}
            </el-tag>
          </template>
        </el-select>
      </div>

      <!-- 关联 -->
      <div class="form-group">
        <label>关联</label>
        <el-select
          v-model="selectedRelations"
          multiple
          filterable
          placeholder="请选择关联"
          class="full-width"
        >
          <el-option
            v-for="relation in relationsStore.relations"
            :key="relation.id"
            :label="relation.name"
            :value="relation.id"
          />
        </el-select>
      </div>

      <!-- 备注 -->
      <div class="form-group">
        <label>备注</label>
        <el-input
          v-model="notes"
          type="textarea"
          placeholder="请输入备注"
          :rows="3"
        />
      </div>

      <!-- 时间信息（仅编辑模式显示） -->
      <div v-if="isEdit && props.bookmark" class="form-group time-info">
        <label>时间信息</label>
        <div class="time-fields">
          <div class="time-row">
            <span class="time-label">创建时间</span>
            <span class="time-value">{{ formatDateTime(props.bookmark.createdAt) }}</span>
          </div>
          <div class="time-row">
            <span class="time-label">修改时间</span>
            <span class="time-value">{{ formatDateTime(props.bookmark.updatedAt) }}</span>
          </div>
          <div class="time-row">
            <span class="time-label">最后使用</span>
            <span class="time-value">{{ formatDateTime(props.bookmark.lastUsedAt) }}</span>
          </div>
        </div>
      </div>

      <!-- 删除（仅编辑模式显示） -->
      <div v-if="isEdit && props.bookmark" class="delete-section">
        <el-button
          type="danger"
          plain
          :icon="Delete"
          :loading="isDeleting"
          @click="handleDelete"
        >
          删除书签
        </el-button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bookmark-edit {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--el-bg-color);
}

.edit-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--el-border-color-light);
}

.edit-header h2 {
  font-size: 16px;
  font-weight: 500;
  margin: 0;
  color: var(--el-text-color-primary);
}

.edit-form {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: flex;
  font-size: 13px;
  color: var(--el-text-color-regular);
  margin-bottom: 8px;
  align-items: center;
}

.required {
  color: var(--el-color-danger);
  margin-left: 4px;
}

.full-width {
  width: 100%;
}

.url-list-container, .account-list-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
  padding: 8px;
  background: var(--el-fill-color-blank);
}

.url-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-right: 8px; /* For scrollbar space */
}

.url-item {
  display: flex;
  gap: 8px;
  align-items: center;
}

.url-input {
  flex: 1;
}

.account-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-right: 8px;
}

.account-item {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  padding-bottom: 12px;
  border-bottom: 1px dashed var(--el-border-color-lighter);
}

.account-item:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.account-fields {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.add-btn {
  width: 100%;
  margin-top: 8px;
  border-style: dashed;
}

.remove-account-btn {
  margin-top: 4px;
}

.time-info .time-fields {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
  padding: 12px;
  background: var(--el-fill-color-blank);
}

.time-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 0;
}

.time-row + .time-row {
  border-top: 1px dashed var(--el-border-color-lighter);
  margin-top: 4px;
  padding-top: 8px;
}

.time-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.time-value {
  font-size: 12px;
  color: var(--el-text-color-regular);
  font-variant-numeric: tabular-nums;
}

.tag-option {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tag-color-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

/* 标签选择器中已选标签的关闭按钮 hover 样式 */
:deep(.el-select .el-tag .el-tag__close:hover) {
  color: #fff;
}

.delete-section {
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid var(--el-border-color-light);
}

.delete-section .el-button {
  width: 100%;
}

.save-btn:hover,
.save-btn:focus {
  background-color: var(--el-color-primary) !important;
  border-color: var(--el-color-primary) !important;
  color: #fff !important;
}
</style>
