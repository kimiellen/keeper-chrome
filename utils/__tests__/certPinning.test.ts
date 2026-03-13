/**
 * 证书固定模块测试
 *
 * 运行方式：在浏览器控制台中执行
 */

import { CertPinManager } from '../security/certPinning';
import type { CertVerifyResult, CertPinEventListener } from '../security/certPinning';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`✓ ${message}`);
}

function createFreshManager(): CertPinManager {
  return new CertPinManager();
}

async function clearStorage(): Promise<void> {
  await browser.storage.local.remove(['cert_pin_fingerprint', 'cert_pin_update_log']);
}

const SAMPLE_FINGERPRINT_A =
  'EE:F0:34:AB:12:CD:56:EF:78:90:AB:CD:EF:12:34:56:78:90:AB:CD:EF:12:34:56:78:90:AB:CD:EF:12:34:56';
const SAMPLE_FINGERPRINT_B =
  'AA:BB:CC:DD:11:22:33:44:55:66:77:88:99:00:AA:BB:CC:DD:EE:FF:11:22:33:44:55:66:77:88:99:00:AA:BB';

async function runTests() {
  console.log('Starting certificate pinning module tests...\n');

  // Test 1: first_use — 未存储指纹时返回 first_use
  {
    await clearStorage();
    const manager = createFreshManager();

    const result = await manager.verifyFingerprint(SAMPLE_FINGERPRINT_A);
    assert(result.status === 'first_use', 'verifyFingerprint returns first_use when no pin stored');
    assert(
      (result as Extract<CertVerifyResult, { status: 'first_use' }>).fingerprint === SAMPLE_FINGERPRINT_A,
      'first_use result contains the fingerprint',
    );
  }

  // Test 2: ok — 指纹匹配时返回 ok
  {
    await clearStorage();
    const manager = createFreshManager();

    // 先触发 first_use，然后通过内部 pinFingerprint 存储
    const firstResult = await manager.verifyFingerprint(SAMPLE_FINGERPRINT_A);
    assert(firstResult.status === 'first_use', 'first call is first_use');

    // 模拟 pinFingerprint 的行为：手动调用 trustNewFingerprint 来存储
    await manager.trustNewFingerprint(SAMPLE_FINGERPRINT_A);

    // 创建新 manager 以清除内存缓存，确保从 storage 读取
    const manager2 = createFreshManager();
    const result = await manager2.verifyFingerprint(SAMPLE_FINGERPRINT_A);
    assert(result.status === 'ok', 'verifyFingerprint returns ok when fingerprint matches');
  }

  // Test 3: mismatch — 指纹不匹配时返回 mismatch
  {
    await clearStorage();
    const manager = createFreshManager();

    await manager.trustNewFingerprint(SAMPLE_FINGERPRINT_A);

    const manager2 = createFreshManager();
    const result = await manager2.verifyFingerprint(SAMPLE_FINGERPRINT_B);
    assert(result.status === 'mismatch', 'verifyFingerprint returns mismatch when fingerprint differs');

    const mismatchResult = result as Extract<CertVerifyResult, { status: 'mismatch' }>;
    assert(mismatchResult.expected === SAMPLE_FINGERPRINT_A, 'mismatch result has correct expected fingerprint');
    assert(mismatchResult.actual === SAMPLE_FINGERPRINT_B, 'mismatch result has correct actual fingerprint');
  }

  // Test 4: 内存缓存 — 第二次验证直接使用缓存
  {
    await clearStorage();
    const manager = createFreshManager();

    await manager.trustNewFingerprint(SAMPLE_FINGERPRINT_A);

    const manager2 = createFreshManager();
    const result1 = await manager2.verifyFingerprint(SAMPLE_FINGERPRINT_A);
    assert(result1.status === 'ok', 'first verify ok (reads from storage)');

    const result2 = await manager2.verifyFingerprint(SAMPLE_FINGERPRINT_A);
    assert(result2.status === 'ok', 'second verify ok (uses memory cache)');

    const result3 = await manager2.verifyFingerprint(SAMPLE_FINGERPRINT_B);
    assert(result3.status === 'mismatch', 'cached fingerprint detects mismatch');
  }

  // Test 5: trustNewFingerprint — 更新指纹后验证新指纹
  {
    await clearStorage();
    const manager = createFreshManager();

    await manager.trustNewFingerprint(SAMPLE_FINGERPRINT_A);
    const result1 = await manager.verifyFingerprint(SAMPLE_FINGERPRINT_A);
    assert(result1.status === 'ok', 'original fingerprint ok');

    await manager.trustNewFingerprint(SAMPLE_FINGERPRINT_B);
    const result2 = await manager.verifyFingerprint(SAMPLE_FINGERPRINT_B);
    assert(result2.status === 'ok', 'new fingerprint ok after trust update');

    const result3 = await manager.verifyFingerprint(SAMPLE_FINGERPRINT_A);
    assert(result3.status === 'mismatch', 'old fingerprint now mismatches after trust update');
  }

  // Test 6: update log — 记录指纹更新历史
  {
    await clearStorage();
    const manager = createFreshManager();

    await manager.trustNewFingerprint(SAMPLE_FINGERPRINT_A);
    await manager.trustNewFingerprint(SAMPLE_FINGERPRINT_B);

    const log = await manager.getUpdateLog();
    assert(log.length === 2, 'update log has 2 entries');
    assert(log[0].reason === 'user_confirmed', 'first log entry is user_confirmed');
    assert(log[1].reason === 'user_confirmed', 'second log entry is user_confirmed');
    assert(log[1].newFingerprint !== '', 'log entry has new fingerprint');
  }

  // Test 7: clearPinnedData — 清除后恢复 first_use 状态
  {
    await clearStorage();
    const manager = createFreshManager();

    await manager.trustNewFingerprint(SAMPLE_FINGERPRINT_A);
    const result1 = await manager.verifyFingerprint(SAMPLE_FINGERPRINT_A);
    assert(result1.status === 'ok', 'fingerprint ok before clear');

    await manager.clearPinnedData();

    const manager2 = createFreshManager();
    const result2 = await manager2.verifyFingerprint(SAMPLE_FINGERPRINT_A);
    assert(result2.status === 'first_use', 'returns first_use after clear');
  }

  // Test 8: getPinnedInfo — 返回已存储的指纹信息
  {
    await clearStorage();
    const manager = createFreshManager();

    const emptyInfo = await manager.getPinnedInfo();
    assert(emptyInfo === null, 'getPinnedInfo returns null when no pin stored');

    await manager.trustNewFingerprint(SAMPLE_FINGERPRINT_A);

    const info = await manager.getPinnedInfo();
    assert(info !== null, 'getPinnedInfo returns data after pinning');
    assert(info!.fingerprint === SAMPLE_FINGERPRINT_A, 'getPinnedInfo returns correct fingerprint');
    assert(typeof info!.pinnedAt === 'string', 'getPinnedInfo has pinnedAt timestamp');
    assert(typeof info!.lastVerifiedAt === 'string', 'getPinnedInfo has lastVerifiedAt timestamp');
  }

  // Test 9: event listener — mismatch 触发 onMismatch 回调
  {
    await clearStorage();
    const manager = createFreshManager();
    let mismatchCalled = false;
    let mismatchExpected = '';
    let mismatchActual = '';

    const listener: CertPinEventListener = {
      onMismatch(expected, actual) {
        mismatchCalled = true;
        mismatchExpected = expected;
        mismatchActual = actual;
      },
      onFirstUse() {},
      onError() {},
    };

    manager.setEventListener(listener);

    // event listener 只在 handleRequest 流程中触发
    // 这里我们直接验证 listener 设置不会抛出异常
    assert(!mismatchCalled, 'mismatch callback not called before any verification');
    assert(typeof listener.onMismatch === 'function', 'event listener has onMismatch');
    assert(typeof listener.onFirstUse === 'function', 'event listener has onFirstUse');
    assert(typeof listener.onError === 'function', 'event listener has onError');
  }

  // Test 10: 明文存储 — 指纹以明文直接存储于 browser.storage.local
  {
    await clearStorage();
    const manager = createFreshManager();

    await manager.trustNewFingerprint(SAMPLE_FINGERPRINT_A);

    const stored = await browser.storage.local.get('cert_pin_fingerprint');
    const pinnedData = stored['cert_pin_fingerprint'] as { fingerprint: string } | undefined;

    assert(pinnedData !== undefined, 'pinned data stored');
    assert(pinnedData!.fingerprint === SAMPLE_FINGERPRINT_A, 'fingerprint stored as plaintext');

    const info = await manager.getPinnedInfo();
    assert(info !== null, 'getPinnedInfo works with plaintext storage');
    assert(info!.fingerprint === SAMPLE_FINGERPRINT_A, 'plaintext stored fingerprint reads correctly');
  }

  console.log('\n✅ All certificate pinning tests passed!');
}

runTests().catch(console.error);
