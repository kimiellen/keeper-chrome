/**
 * Keeper API TypeScript Types
 *
 * 对齐 docs/api.md 中的所有数据模型
 */

// ============ 通用类型 ============

/** RFC 7807 错误响应 */
export interface ApiError {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance?: string;
  errors?: ApiFieldError[];
}

export interface ApiFieldError {
  field: string;
  message: string;
  code: string;
}

/** 分页响应 */
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  limit?: number;
  offset?: number;
}

// ============ 认证 ============

export interface InitializeRequest {
  email: string;
  password: string;
}

export interface InitializeResponse {
  message: string;
  userId?: string;
}

export interface UnlockRequest {
  password: string;
}

export interface AuthInfoResponse {
  email: string;
}

export interface UnlockResponse {
  message: string;
}

export interface StatusResponseUnlocked {
  locked: false;
  sessionExpiresAt: string;
}

export interface StatusResponseLocked {
  locked: true;
}

export type AuthStatus = StatusResponseUnlocked | StatusResponseLocked;

// ============ 书签 ============

export interface UrlItem {
  url: string;
  lastUsed?: string;
}

export interface AccountItem {
  id: number;
  username: string;
  password: string;
  relatedIds: number[];
  createdAt: string;
  lastUsed: string;
}

export interface Bookmark {
  id: string;
  name: string;
  pinyinInitials: string;
  tagIds: number[];
  urls: UrlItem[];
  notes: string;
  accounts: AccountItem[];
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string;
}

export interface BookmarkCreate {
  name: string;
  pinyinInitials?: string;
  tagIds?: number[];
  urls?: UrlItem[];
  notes?: string;
  accounts?: AccountCreate[];
}

export interface AccountCreate {
  username: string;
  password: string;
  relatedIds?: number[];
}

export interface BookmarkUpdate extends BookmarkCreate {
  // PUT requires all fields
}

export interface BookmarkPatch {
  name?: string;
  pinyinInitials?: string;
  tagIds?: number[];
  urls?: UrlItem[];
  notes?: string;
  accounts?: AccountCreate[];
}

export interface BookmarkListParams {
  limit?: number;
  offset?: number;
  sort?: string;
  tagIds?: string;
  search?: string;
  [key: string]: string | number | boolean | undefined;
}

export type BookmarkListResponse = PaginatedResponse<Bookmark>;

export interface BookmarkUseRequest {
  url?: string;
  accountId?: number;
}

export interface BookmarkUseResponse {
  message: string;
  lastUsedAt: string;
}

// ============ 标签 ============

export interface Tag {
  id: number;
  name: string;
  color: string;
  icon: string;
  bookmarkCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface TagCreate {
  name: string;
  color?: string;
  icon?: string;
}

export interface TagUpdate extends TagCreate {}

export interface TagListParams {
  sort?: string;
  [key: string]: string | number | boolean | undefined;
}

export type TagListResponse = PaginatedResponse<Tag>;

// ============ 关联 ============

export type RelationType = 'phone' | 'email' | 'idcard' | 'social' | 'other';

export interface Relation {
  id: number;
  name: string;
  value?: string;
  type: RelationType;
  bookmarkCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface RelationCreate {
  name: string;
  value?: string;
  type: RelationType;
}

export interface RelationUpdate extends RelationCreate {}

export type RelationListResponse = PaginatedResponse<Relation>;

// ============ 统计 ============

export interface TagCount {
  id: number;
  name: string;
  count: number;
}

export interface RecentlyUsedBookmark {
  id: string;
  name: string;
  lastUsedAt: string;
}

export interface StatsResponse {
  totalBookmarks: number;
  totalTags: number;
  totalRelations: number;
  totalAccounts: number;
  mostUsedTags: TagCount[];
  recentlyUsed: RecentlyUsedBookmark[];
}

// ============ 导入导出 ============

export interface ExportResponse {
  version: string;
  exportedAt: string;
  bookmarks: Bookmark[];
  tags: Tag[];
  relations: Relation[];
}

export interface ImportRequest {
  format: 'keeper_json' | 'bitwarden_json' | 'csv';
  content: string;
  conflictPolicy: 'skip' | 'rename' | 'overwrite';
}

export interface ImportCounts {
  bookmarks: number;
  tags: number;
  relations: number;
}

export interface ImportSkipped {
  bookmarks: number;
  reason: string;
}

export interface ImportResponse {
  message: string;
  imported: ImportCounts;
  skipped: ImportSkipped;
  warnings: string[];
}

export interface ImportConflict {
  name: string;
  type: string;
}

export interface ImportPreviewResponse {
  format: string;
  totalBookmarks: number;
  totalTags: number;
  totalRelations: number;
  conflicts: ImportConflict[];
  warnings: string[];
}

// ============ 健康检查 ============

export interface HealthResponse {
  status: 'healthy';
  version: string;
  database: 'connected';
  timestamp: string;
}

// ============ 数据库管理 ============

export interface DatabaseInfo {
  path: string;
  name: string;
}

export interface DatabaseListResponse {
  databases: DatabaseInfo[];
  current: string | null;
}

export interface DatabaseOpenRequest {
  path: string;
}

export interface DatabaseOpenResponse {
  message: string;
  name: string;
}

export interface DatabaseCreateRequest {
  path: string;
  email: string;
  password: string;
}

export interface DatabaseCreateResponse {
  message: string;
  name: string;
}

export interface DatabaseRemoveRequest {
  path: string;
}
