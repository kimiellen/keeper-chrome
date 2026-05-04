import { keeperClient } from '../api/client';
import type { Bookmark, BookmarkCreate } from '../api/types';

interface MatchingBookmark {
  bookmarkId: string;
  name: string;
  accounts: Array<{
    id: number;
    username: string;
    password?: string;
  }>;
}

type KeeperMessage =
  | { type: 'GET_AUTH_STATUS' }
  | { type: 'GET_MATCHING_BOOKMARKS'; payload: { url: string } }
  | { type: 'GET_DECRYPTED_PASSWORD'; payload: { bookmarkId: string; accountId: number } }
  | { type: 'SAVE_CREDENTIALS'; payload: { url: string; username: string; password: string } }
  | { type: 'MARK_AS_USED'; payload: { bookmarkId: string; url?: string; accountId?: number } }
  | { type: 'LOCK_AND_HIDE' }
  | { type: 'FOCUS_INPUT' }
  | { type: 'SAVE_PENDING_CREDENTIAL'; payload: { url: string; hostname: string; username: string; password: string } }
  | { type: 'GET_PENDING_CREDENTIAL' }
  | { type: 'CLEAR_PENDING_CREDENTIAL' };

const SETTINGS_STORAGE_KEY = 'keeper_settings';

// ============ 待保存凭据状态管理 ============

/** 待处理的凭据 */
interface PendingCredential {
  url: string;
  hostname: string;
  username: string;
  password: string;
  capturedAt: number;
  sourceTabId: number;
}

const PENDING_TIMEOUT = 5 * 60 * 1000; // 5分钟超时
const PENDING_CREDENTIAL_KEY = 'keeper_pending_credential';

/**
 * 保存待处理凭据到 chrome.storage.session
 */
async function savePendingCredential(
  credential: Omit<PendingCredential, 'capturedAt'>,
  sendResponse: (response: { success?: boolean }) => void,
): Promise<void> {
  try {
    await chrome.storage.session.set({
      [PENDING_CREDENTIAL_KEY]: {
        ...credential,
        capturedAt: Date.now(),
      },
    });
    console.log('[Keeper:bg] Pending credential saved for', credential.hostname);
    sendResponse({ success: true });
  } catch (error) {
    console.error('[Keeper:bg] Failed to save pending credential:', error);
    sendResponse({ success: false });
  }
}

/**
 * 获取待处理凭据
 */
async function getPendingCredential(
  sendResponse: (response: { credential?: PendingCredential | null }) => void,
): Promise<void> {
  try {
    const result = await chrome.storage.session.get(PENDING_CREDENTIAL_KEY);
    const pendingCredential = result[PENDING_CREDENTIAL_KEY] as PendingCredential | undefined;

    if (pendingCredential && Date.now() - pendingCredential.capturedAt > PENDING_TIMEOUT) {
      await chrome.storage.session.remove(PENDING_CREDENTIAL_KEY);
      sendResponse({ credential: null });
      return;
    }

    sendResponse({ credential: pendingCredential || null });
  } catch (error) {
    console.error('[Keeper:bg] Failed to get pending credential:', error);
    sendResponse({ credential: null });
  }
}

/**
 * 清除待处理凭据
 */
async function clearPendingCredential(
  sendResponse: (response: { success?: boolean }) => void,
): Promise<void> {
  try {
    await chrome.storage.session.remove(PENDING_CREDENTIAL_KEY);
    sendResponse({ success: true });
  } catch (error) {
    console.error('[Keeper:bg] Failed to clear pending credential:', error);
    sendResponse({ success: false });
  }
}

/**
 * 解析 URL 并提取主机名。
 */
function getHostname(url: string): string {
  return new URL(url).hostname.toLowerCase();
}

/**
 * 判断书签是否与页面 URL 的主机名匹配。
 */
function isBookmarkMatchingHostname(bookmark: Bookmark, pageUrl: string): boolean {
  const pageHostname = getHostname(pageUrl);

  return bookmark.urls.some((urlItem) => {
    try {
      return getHostname(urlItem.url) === pageHostname;
    } catch {
      return false;
    }
  });
}

/**
 * 统一提取错误信息。
 */
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return 'Unknown error';
}

/**
 * 返回当前登录锁定状态。
 */
async function handleGetAuthStatus(): Promise<{ locked?: boolean; error?: string }> {
  console.log('[Keeper:bg] handleGetAuthStatus called');
  await keeperClient.loadToken();
  const token = keeperClient.getToken();
  console.log('[Keeper:bg] token loaded:', token ? 'exists (' + token.substring(0, 10) + '...)' : 'null');

  try {
    const status = await keeperClient.getStatus();
    console.log('[Keeper:bg] getStatus returned:', status);
    return { locked: status.locked };
  } catch (error) {
    console.error('[Keeper:bg] getStatus error:', error);
    return { error: getErrorMessage(error) };
  }
}

/**
 * 获取与当前页面主机名匹配的书签列表。
 */
async function handleGetMatchingBookmarks(
  payload: { url: string },
  sender?: chrome.runtime.MessageSender,
): Promise<{ bookmarks?: MatchingBookmark[]; error?: string; locked?: boolean }> {
  await keeperClient.loadToken();

  try {
    const status = await keeperClient.getStatus();
    if (status.locked) {
      return { error: 'Unauthorized', locked: true };
    }
  } catch {
    return { error: 'Unauthorized', locked: true };
  }

  try {
    const pageUrl = sender?.tab?.url ?? payload.url;
    console.log('[Keeper:bg] handleGetMatchingBookmarks called for URL:', pageUrl);
    const bookmarksResult = await keeperClient.getBookmarks({ limit: 5000 });
    console.log('[Keeper:bg] got bookmarks:', bookmarksResult.data.length);
    const matched = bookmarksResult.data.filter((bookmark) =>
      isBookmarkMatchingHostname(bookmark, pageUrl),
    );
    console.log('[Keeper:bg] matched bookmarks:', matched.length);

    const bookmarks: MatchingBookmark[] = matched.map((bookmark) => ({
      bookmarkId: bookmark.id,
      name: bookmark.name,
      accounts: bookmark.accounts.map((account) => ({
        id: account.id,
        username: account.username,
      })),
    }));

    return { bookmarks };
  } catch (error) {
    console.error('[Keeper:bg] handleGetMatchingBookmarks error:', error);
    return { error: getErrorMessage(error) };
  }
}

/**
 * 获取指定账号的解密后的密码。
 */
async function handleGetDecryptedPassword(
  payload: { bookmarkId: string; accountId: number },
): Promise<{ password?: string; error?: string; locked?: boolean }> {
  await keeperClient.loadToken();

  try {
    const status = await keeperClient.getStatus();
    if (status.locked) {
      return { error: 'Unauthorized', locked: true };
    }
  } catch {
    return { error: 'Unauthorized', locked: true };
  }

  try {
    console.log('[Keeper:bg] handleGetDecryptedPassword called for bookmark:', payload.bookmarkId, 'account:', payload.accountId);
    const bookmark = await keeperClient.getBookmark(payload.bookmarkId, true);
    const account = bookmark.accounts.find(a => a.id === payload.accountId);

    if (!account) {
      return { error: 'Account not found' };
    }

    console.log('[Keeper:bg] decrypted password for account:', account.username);
    return { password: account.password };
  } catch (error) {
    console.error('[Keeper:bg] handleGetDecryptedPassword error:', error);
    return { error: getErrorMessage(error) };
  }
}

/**
 * 保存新的站点账号凭据。
 */
async function handleSaveCredentials(
  payload: { url: string; username: string; password: string },
  sendResponse: (response: { success?: boolean; error?: string }) => void,
): Promise<void> {
  try {
    const pageHostname = getHostname(payload.url);

    const bookmarksResult = await keeperClient.getBookmarks({ limit: 5000 });
    const existingBookmark = bookmarksResult.data.find((bookmark) =>
      isBookmarkMatchingHostname(bookmark, payload.url),
    );

    if (existingBookmark) {
      const normalizedUsername = payload.username.toLowerCase();
      const existingAccount = existingBookmark.accounts.find(
        (account) => account.username.toLowerCase() === normalizedUsername,
      );

      if (existingAccount) {
        const updatedAccounts = existingBookmark.accounts.map((account) =>
          account.username.toLowerCase() === normalizedUsername
            ? { username: account.username, password: payload.password, relatedIds: account.relatedIds }
            : { username: account.username, password: account.password, relatedIds: account.relatedIds },
        );
        await keeperClient.patchBookmark(existingBookmark.id, { accounts: updatedAccounts });
      } else {
        const allAccounts = existingBookmark.accounts.map((account) => ({
          username: account.username,
          password: account.password,
          relatedIds: account.relatedIds,
        }));
        allAccounts.push({ username: payload.username, password: payload.password, relatedIds: [] });
        await keeperClient.patchBookmark(existingBookmark.id, { accounts: allAccounts });
      }
    } else {
      const bookmarkData: BookmarkCreate = {
        name: pageHostname,
        urls: [{ url: payload.url }],
        accounts: [{ username: payload.username, password: payload.password }],
      };
      await keeperClient.createBookmark(bookmarkData);
    }

    sendResponse({ success: true });

    console.log('[Keeper:bg] SAVE_CREDENTIALS done, notifying via storage');
    await chrome.storage.local.set({ bookmarkChangedAt: Date.now() });
  } catch (error) {
    sendResponse({ error: getErrorMessage(error) });
  }
}

/**
 * 标记书签或账号已使用。
 */
async function handleMarkAsUsed(
  payload: { bookmarkId: string; url?: string; accountId?: number },
  sendResponse: (response: { success?: boolean; error?: string }) => void,
): Promise<void> {
  try {
    await keeperClient.useBookmark(payload.bookmarkId, {
      url: payload.url,
      accountId: payload.accountId,
    });

    sendResponse({ success: true });
  } catch (error) {
    sendResponse({ error: getErrorMessage(error) });
  }
}

export default defineBackground({
  async main() {
    // 设置 sidePanel 行为：点击工具栏图标时打开 side panel
    try {
      await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
      console.log('[Keeper:bg] Side panel behavior set');
    } catch (e) {
      console.warn('[Keeper:bg] Failed to set side panel behavior:', e);
    }

    // 启动时从 storage 加载 token
    await keeperClient.loadToken();
    console.log('[Keeper:bg] Token loaded, token exists:', keeperClient.getToken() !== null);

    chrome.commands.onCommand.addListener(async (command) => {
      if (command !== 'fill_credentials') {
        return;
      }

      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) {
          return;
        }

        await chrome.tabs.sendMessage(tab.id, { type: 'FILL_FROM_SHORTCUT' });
      } catch {
        // 忽略发送失败
      }
    });

    chrome.runtime.onMessage.addListener((message: KeeperMessage, sender, sendResponse) => {
      switch (message.type) {
        case 'GET_AUTH_STATUS': {
          void handleGetAuthStatus().then(sendResponse);
          return true;
        }

        case 'GET_MATCHING_BOOKMARKS': {
          void handleGetMatchingBookmarks(message.payload, sender).then(sendResponse);
          return true;
        }

        case 'GET_DECRYPTED_PASSWORD': {
          void handleGetDecryptedPassword(message.payload).then(sendResponse);
          return true;
        }

        case 'SAVE_CREDENTIALS': {
          void handleSaveCredentials(message.payload, sendResponse);
          return true;
        }

        case 'MARK_AS_USED': {
          void handleMarkAsUsed(message.payload, sendResponse);
          return true;
        }

        case 'SAVE_PENDING_CREDENTIAL': {
          void savePendingCredential(
            { ...message.payload, sourceTabId: sender.tab?.id || 0 },
            sendResponse,
          );
          return true;
        }

        case 'GET_PENDING_CREDENTIAL': {
          void getPendingCredential(sendResponse);
          return true;
        }

        case 'CLEAR_PENDING_CREDENTIAL': {
          void clearPendingCredential(sendResponse);
          return true;
        }

        default:
          sendResponse({ error: 'Unsupported message type' });
          return false;
      }
    });

    // 监听标签页更新，处理页面跳转后恢复通知栏
    chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
      if (changeInfo.status !== 'complete' || !tab.url) {
        return;
      }

      // 检查是否有待处理凭据
      let pendingCredential: PendingCredential | null = null;
      try {
        const result = await chrome.storage.session.get(PENDING_CREDENTIAL_KEY);
        pendingCredential = result[PENDING_CREDENTIAL_KEY] || null;
      } catch {
        return;
      }

      if (!pendingCredential) return;

      // 检查是否过期
      if (Date.now() - pendingCredential.capturedAt > PENDING_TIMEOUT) {
        await chrome.storage.session.remove(PENDING_CREDENTIAL_KEY);
        return;
      }

      // 检查URL是否匹配 (同一域名)
      try {
        const pendingHostname = new URL(pendingCredential.url).hostname;
        const currentHostname = new URL(tab.url).hostname;

        if (pendingHostname === currentHostname) {
          console.log('[Keeper:bg] Restoring notification bar for', currentHostname);
          try {
            await chrome.tabs.sendMessage(tabId, {
              type: 'SHOW_PENDING_CREDENTIAL',
              payload: {
                username: pendingCredential.username,
                password: pendingCredential.password,
                originalUrl: pendingCredential.url,
              },
            });
            // 发送后清除，避免重复显示
            await chrome.storage.session.remove(PENDING_CREDENTIAL_KEY);
          } catch {
            // 页面可能不支持 content script，忽略错误
          }
        }
      } catch {
        // URL解析错误，忽略
      }
    });
  },
});
