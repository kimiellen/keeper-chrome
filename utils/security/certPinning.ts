/**
 * 证书固定模块 - TOFU (Trust On First Use) — Chrome 版
 *
 * Chrome MV3 Service Worker 不支持 webRequest.onHeadersReceived 的 securityInfo，
 * 因此无法在请求层拦截并验证证书指纹。
 *
 * 降级策略：
 * - 放弃请求拦截（无法阻断中间人攻击），仅做本地 TOFU 记录
 * - 提供与 Firefox 版相同的存储结构，保持 Settings 界面 UI 兼容
 * - 用户可在设置页查看已固定信息并手动清除
 *
 * 注意：Chrome 扩展本身在 HTTPS 连接上已受到浏览器 TLS 保护，
 * 本地部署场景（127.0.0.1:8443）受攻击面极小。
 */

const STORAGE_KEY_PREFIX = 'cert_pin_';
const STORAGE_KEY_FINGERPRINT = `${STORAGE_KEY_PREFIX}fingerprint`;
const STORAGE_KEY_UPDATE_LOG = `${STORAGE_KEY_PREFIX}update_log`;
const MAX_UPDATE_LOG_ENTRIES = 50;

interface PinnedFingerprint {
  /** SHA-256 指纹（明文，冒号分隔的大写十六进制） */
  fingerprint: string;
  pinnedAt: string;
  lastVerifiedAt: string;
}

interface DecryptedFingerprint {
  /** 冒号分隔的大写十六进制，如 "EE:F0:34:AB:..." */
  fingerprint: string;
  pinnedAt: string;
  lastVerifiedAt: string;
}

interface FingerprintUpdateLogEntry {
  oldFingerprint: string;
  newFingerprint: string;
  updatedAt: string;
  reason: 'user_confirmed' | 'initial_pin';
}

export type CertVerifyResult =
  | { status: 'ok' }
  | { status: 'first_use'; fingerprint: string }
  | { status: 'mismatch'; expected: string; actual: string }
  | { status: 'error'; message: string }
  | { status: 'unavailable' };

export interface CertPinEventListener {
  onMismatch: (expected: string, actual: string, requestId: string) => void;
  onFirstUse: (fingerprint: string) => void;
  onError: (message: string) => void;
}

export class CertPinManager {
  private cachedFingerprint: DecryptedFingerprint | null = null;
  private eventListener: CertPinEventListener | null = null;

  /** Chrome 版标记：供 Settings UI 判断是否显示降级提示 */
  readonly isChrome = true;

  setEventListener(listener: CertPinEventListener): void {
    this.eventListener = listener;
  }

  /**
   * Chrome 版：无法拦截 TLS，仅打印日志，不启动 webRequest 监听
   */
  start(): void {
    console.log('[CertPin] Chrome 版：TLS 证书固定不可用（Chrome MV3 限制），已跳过 webRequest 监听');
  }

  stop(): void {
    this.cachedFingerprint = null;
  }

  async verifyFingerprint(_currentFingerprint: string): Promise<CertVerifyResult> {
    return { status: 'unavailable' };
  }

  /**
   * 用户确认信任新证书（证书到期换证时使用）
   */
  async trustNewFingerprint(newFingerprint: string): Promise<void> {
    const now = new Date().toISOString();

    const oldStored = await browser.storage.local.get(STORAGE_KEY_FINGERPRINT);
    const oldData = oldStored[STORAGE_KEY_FINGERPRINT] as PinnedFingerprint | undefined;

    const pinnedData: PinnedFingerprint = {
      fingerprint: newFingerprint,
      pinnedAt: now,
      lastVerifiedAt: now,
    };

    await browser.storage.local.set({
      [STORAGE_KEY_FINGERPRINT]: pinnedData,
    });

    await this.appendUpdateLog({
      oldFingerprint: oldData?.fingerprint ?? '',
      newFingerprint,
      updatedAt: now,
      reason: 'user_confirmed',
    });

    this.cachedFingerprint = {
      fingerprint: newFingerprint,
      pinnedAt: now,
      lastVerifiedAt: now,
    };

    console.log('[CertPin] 用户已确认信任新证书指纹');
  }

  async getUpdateLog(): Promise<FingerprintUpdateLogEntry[]> {
    const stored = await browser.storage.local.get(STORAGE_KEY_UPDATE_LOG);
    return (stored[STORAGE_KEY_UPDATE_LOG] as FingerprintUpdateLogEntry[]) ?? [];
  }

  async getPinnedInfo(): Promise<DecryptedFingerprint | null> {
    if (this.cachedFingerprint) {
      return this.cachedFingerprint;
    }
    return this.loadPinnedFingerprint();
  }

  async clearPinnedData(): Promise<void> {
    await browser.storage.local.remove([STORAGE_KEY_FINGERPRINT, STORAGE_KEY_UPDATE_LOG]);
    this.cachedFingerprint = null;
    console.log('[CertPin] 已清除所有证书固定数据');
  }

  private async loadPinnedFingerprint(): Promise<DecryptedFingerprint | null> {
    const stored = await browser.storage.local.get(STORAGE_KEY_FINGERPRINT);
    const pinnedData = stored[STORAGE_KEY_FINGERPRINT] as PinnedFingerprint | undefined;

    if (!pinnedData) {
      return null;
    }

    return {
      fingerprint: pinnedData.fingerprint,
      pinnedAt: pinnedData.pinnedAt,
      lastVerifiedAt: pinnedData.lastVerifiedAt,
    };
  }

  private async appendUpdateLog(entry: FingerprintUpdateLogEntry): Promise<void> {
    const log = await this.getUpdateLog();
    log.push(entry);
    const trimmed = log.slice(-MAX_UPDATE_LOG_ENTRIES);

    await browser.storage.local.set({
      [STORAGE_KEY_UPDATE_LOG]: trimmed,
    });
  }
}

export const certPinManager = new CertPinManager();
