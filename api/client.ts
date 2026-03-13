/**
 * Keeper API Client
 *
 * 完整的 REST API 客户端，支持认证、书签、标签、关联、统计等功能
 */

import type {
  ApiError,
  InitializeRequest,
  InitializeResponse,
  UnlockRequest,
  UnlockResponse,
  AuthInfoResponse,
  AuthStatus,
  Bookmark,
  BookmarkCreate,
  BookmarkUpdate,
  BookmarkPatch,
  BookmarkListParams,
  BookmarkListResponse,
  BookmarkUseRequest,
  BookmarkUseResponse,
  Tag,
  TagCreate,
  TagUpdate,
  TagListParams,
  TagListResponse,
  Relation,
  RelationCreate,
  RelationUpdate,
  RelationListResponse,
  StatsResponse,
  ImportResponse,
  ImportPreviewResponse,
  HealthResponse,
  DatabaseListResponse,
  DatabaseOpenRequest,
  DatabaseOpenResponse,
  DatabaseCreateRequest,
  DatabaseCreateResponse,
  DatabaseRemoveRequest,
} from './types';

const DEFAULT_BASE_URL = 'https://127.0.0.1:8443/api';
const DEFAULT_TIMEOUT = 30000;
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

/**
 * API 错误类
 */
export class KeeperApiError extends Error {
  constructor(
    message: string,
    public readonly type: string,
    public readonly status: number,
    public readonly detail: string,
    public readonly errors?: { field: string; message: string; code: string }[]
  ) {
    super(message);
    this.name = 'KeeperApiError';
  }

  static fromResponse(error: ApiError): KeeperApiError {
    return new KeeperApiError(
      error.detail || 'Unknown error',
      error.type || 'unknown',
      error.status || 500,
      error.detail || '',
      error.errors
    );
  }

  static isAuthError(error: unknown): boolean {
    return error instanceof KeeperApiError && (error.status === 401 || error.status === 403);
  }

  static isNotFoundError(error: unknown): boolean {
    return error instanceof KeeperApiError && error.status === 404;
  }

  static isValidationError(error: unknown): boolean {
    return error instanceof KeeperApiError && error.status === 422;
  }
}

/**
 * API 客户端选项
 */
export interface KeeperClientOptions {
  baseUrl?: string;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  onUnauthorized?: () => void;
}

/**
 * Keeper API 客户端
 */
export class KeeperClient {
  private baseUrl: string;
  private timeout: number;
  private retries: number;
  private retryDelay: number;
  private onUnauthorized?: () => void;

  constructor(options: KeeperClientOptions = {}) {
    this.baseUrl = options.baseUrl || DEFAULT_BASE_URL;
    this.timeout = options.timeout || DEFAULT_TIMEOUT;
    this.retries = options.retries || MAX_RETRIES;
    this.retryDelay = options.retryDelay || RETRY_DELAY;
    this.onUnauthorized = options.onUnauthorized;
  }

  /**
   * 发送 API 请求
   */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    params?: Record<string, string | number | boolean | undefined>
  ): Promise<T> {
    // 构建 URL
    let url = `${this.baseUrl}${path}`;
    if (params) {
      const searchParams = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) {
          searchParams.append(key, String(value));
        }
      }
      const queryString = searchParams.toString();
      if (queryString) {
        url += `?${queryString}`;
      }
    }

    // 构建请求选项
    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      credentials: 'include', // 发送 Cookie
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    // 发送请求（带重试）
    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      try {
        const response = await this.fetchWithTimeout(url, options);

        // 处理 401 未授权
        if (response.status === 401 && this.onUnauthorized) {
          this.onUnauthorized();
        }

        // 204 No Content
        if (response.status === 204) {
          return undefined as T;
        }

        // 检查响应状态
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          const error: ApiError = body && body.type
            ? body
            : {
                type: 'https://keeper.local/errors/unknown',
                title: 'Error',
                status: response.status,
                detail: body?.detail
                  ? (Array.isArray(body.detail)
                    ? body.detail.map((e: any) => e.msg || e.message).join('; ')
                    : String(body.detail))
                  : response.statusText,
              };
          throw KeeperApiError.fromResponse(error);
        }

        // 解析 JSON 响应
        return response.json() as Promise<T>;
      } catch (error) {
        // 如果是可重试的错误且还有重试次数
        if (attempt < this.retries && this.isRetryableError(error)) {
          lastError = error as Error;
          await this.delay(this.retryDelay * (attempt + 1));
          continue;
        }
        throw error;
      }
    }

    throw lastError;
  }

  /**
   * 带超时的 fetch
   */
  private fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Request timeout after ${this.timeout}ms`));
      }, this.timeout);

      fetch(url, options)
        .then((response) => {
          clearTimeout(timeoutId);
          resolve(response);
        })
        .catch((error) => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  /**
   * 判断错误是否可重试
   */
  private isRetryableError(error: unknown): boolean {
    if (error instanceof KeeperApiError) {
      // 网络错误、5xx 错误可重试
      return error.status >= 500 || error.type?.includes('network') === true;
    }
    if (error instanceof TypeError) {
      // 网络错误（DNS 解析失败、连接失败等）可重试，但证书错误不重试
      return !KeeperClient.isCertError(error);
    }
    return false;
  }

  /**
   * 判断是否为证书相关错误（自签名证书未被信任）
   */
  static isCertError(error: unknown): boolean {
    if (!(error instanceof TypeError)) return false;
    const msg = error.message.toLowerCase();
    return msg.includes('failed to fetch') || msg.includes('networkerror');
  }

  /**
   * 将底层 fetch 错误转换为用户可读的错误信息
   */
  static getFriendlyErrorMessage(error: unknown): string {
    if (error instanceof KeeperApiError) {
      return error.detail || error.message;
    }
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      if (msg.includes('failed to fetch') || msg.includes('networkerror') || msg.includes('timeout')) {
        return '无法连接后端服务。请确认：\n1. 后端服务已启动\n2. 已在浏览器中信任自签名证书（访问 https://127.0.0.1:8443 并点击「继续访问」）';
      }
      return error.message;
    }
    return '未知错误';
  }

  /**
   * 延迟
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ============ 健康检查 ============

  /** 健康检查（开发环境） */
  async health(): Promise<HealthResponse> {
    return this.request<HealthResponse>('GET', '/health');
  }

  // ============ 认证 ============

  /** 初始化（首次使用） */
  async initialize(data: InitializeRequest): Promise<InitializeResponse> {
    return this.request<InitializeResponse>('POST', '/auth/initialize', data);
  }

  async getAuthInfo(): Promise<AuthInfoResponse> {
    return this.request<AuthInfoResponse>('GET', '/auth/info');
  }

  /** 解锁（登录） */
  async unlock(data: UnlockRequest): Promise<UnlockResponse> {
    return this.request<UnlockResponse>('POST', '/auth/unlock', data);
  }

  /** 锁定（登出） */
  async lock(): Promise<void> {
    return this.request<void>('POST', '/auth/lock');
  }

  /** 检查会话状态 */
  async getStatus(): Promise<AuthStatus> {
    return this.request<AuthStatus>('GET', '/auth/status');
  }

  // ============ 书签 ============

  /** 获取书签列表 */
  async getBookmarks(params?: BookmarkListParams): Promise<BookmarkListResponse> {
    return this.request<BookmarkListResponse>('GET', '/bookmarks', undefined, params);
  }

  /** 获取单个书签 */
  async getBookmark(id: string): Promise<Bookmark> {
    return this.request<Bookmark>('GET', `/bookmarks/${id}`);
  }

  /** 创建书签 */
  async createBookmark(data: BookmarkCreate): Promise<Bookmark> {
    return this.request<Bookmark>('POST', '/bookmarks', data);
  }

  /** 完整更新书签（PUT） */
  async updateBookmark(id: string, data: BookmarkUpdate): Promise<Bookmark> {
    return this.request<Bookmark>('PUT', `/bookmarks/${id}`, data);
  }

  /** 部分更新书签（PATCH） */
  async patchBookmark(id: string, data: BookmarkPatch): Promise<Bookmark> {
    return this.request<Bookmark>('PATCH', `/bookmarks/${id}`, data);
  }

  /** 删除书签 */
  async deleteBookmark(id: string): Promise<void> {
    return this.request<void>('DELETE', `/bookmarks/${id}`);
  }

  /** 更新最后使用时间 */
  async useBookmark(id: string, data: BookmarkUseRequest): Promise<BookmarkUseResponse> {
    return this.request<BookmarkUseResponse>('POST', `/bookmarks/${id}/use`, data);
  }

  // ============ 标签 ============

  /** 获取标签列表 */
  async getTags(params?: TagListParams): Promise<TagListResponse> {
    return this.request<TagListResponse>('GET', '/tags', undefined, params);
  }

  /** 获取单个标签 */
  async getTag(id: number): Promise<Tag> {
    return this.request<Tag>('GET', `/tags/${id}`);
  }

  /** 创建标签 */
  async createTag(data: TagCreate): Promise<Tag> {
    return this.request<Tag>('POST', '/tags', data);
  }

  /** 更新标签 */
  async updateTag(id: number, data: TagUpdate): Promise<Tag> {
    return this.request<Tag>('PUT', `/tags/${id}`, data);
  }

  /** 删除标签 */
  async deleteTag(id: number, cascade: boolean = false): Promise<void> {
    return this.request<void>('DELETE', `/tags/${id}`, undefined, { cascade });
  }

  // ============ 关联 ============

  /** 获取关联列表 */
  async getRelations(): Promise<RelationListResponse> {
    return this.request<RelationListResponse>('GET', '/relations');
  }

  /** 获取单个关联 */
  async getRelation(id: number): Promise<Relation> {
    return this.request<Relation>('GET', `/relations/${id}`);
  }

  /** 创建关联 */
  async createRelation(data: RelationCreate): Promise<Relation> {
    return this.request<Relation>('POST', '/relations', data);
  }

  /** 更新关联 */
  async updateRelation(id: number, data: RelationUpdate): Promise<Relation> {
    return this.request<Relation>('PUT', `/relations/${id}`, data);
  }

  /** 删除关联 */
  async deleteRelation(id: number, cascade: boolean = false): Promise<void> {
    return this.request<void>('DELETE', `/relations/${id}`, undefined, { cascade });
  }

  // ============ 统计 ============

  /** 获取概览统计 */
  async getStats(): Promise<StatsResponse> {
    return this.request<StatsResponse>('GET', '/stats');
  }

  // ============ 导出 ============

  /** 导出 JSON（返回原始 Response 以便触发下载） */
  async exportJson(): Promise<Response> {
    const url = `${this.baseUrl}/transfer/export/json`;
    const response = await this.fetchWithTimeout(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'include',
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      const error: ApiError = body && body.type
        ? body
        : {
            type: 'https://keeper.local/errors/unknown',
            title: 'Error',
            status: response.status,
            detail: response.statusText,
          };
      throw KeeperApiError.fromResponse(error);
    }
    return response;
  }

  // ============ 数据库管理 ============

  /** 获取数据库列表 */
  async listDatabases(): Promise<DatabaseListResponse> {
    return this.request<DatabaseListResponse>('GET', '/db/list');
  }

  /** 打开已有数据库 */
  async openDatabase(data: DatabaseOpenRequest): Promise<DatabaseOpenResponse> {
    return this.request<DatabaseOpenResponse>('POST', '/db/open', data);
  }

  /** 创建新数据库 */
  async createDatabase(data: DatabaseCreateRequest): Promise<DatabaseCreateResponse> {
    return this.request<DatabaseCreateResponse>('POST', '/db/create', data);
  }

  async removeDatabase(data: DatabaseRemoveRequest): Promise<void> {
    return this.request<void>('POST', '/db/remove', data);
  }

  // ============ 导入 ============

  /** 导入数据（Keeper JSON 格式） */
  async importKeeperJson(content: string, conflictPolicy: 'skip' | 'rename' | 'overwrite' = 'skip'): Promise<ImportResponse> {
    return this.request<ImportResponse>('POST', '/transfer/import', {
      format: 'keeper_json',
      content,
      conflictPolicy,
    });
  }

  /** 预览导入内容 */
  async previewImport(content: string, format: string): Promise<ImportPreviewResponse> {
    return this.request<ImportPreviewResponse>('POST', '/transfer/import/preview', {
      format,
      content,
    });
  }
}

// 导出默认客户端实例
export const keeperClient = new KeeperClient();
