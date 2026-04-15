/**
 * API 客户端测试
 *
 * 使用方式：在浏览器控制台中测试
 */

import { KeeperClient } from '../client';

// 创建测试客户端（指向本地开发服务器）
const client = new KeeperClient({
  baseUrl: 'http://127.0.0.1:51000/api',
  timeout: 10000,
  retries: 2,
});

/**
 * 测试辅助函数
 */
async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`✓ ${name}`);
    return true;
  } catch (error) {
    console.error(`✗ ${name}:`, error);
    return false;
  }
}

async function assertEqual<T>(actual: T, expected: T, message?: string) {
  if (actual !== expected) {
    throw new Error(
      `Assertion failed: ${message || ''}\n  Expected: ${JSON.stringify(expected)}\n  Actual: ${JSON.stringify(actual)}`
    );
  }
}

/**
 * 运行所有测试
 */
async function runTests() {
  console.log('Starting API client tests...\n');

  let passed = 0;
  let failed = 0;

  // Test 1: 健康检查
  await test('Health check', async () => {
    const health = await client.health();
    assertEqual(health.status, 'healthy');
    assertEqual(health.database, 'connected');
  }) ? passed++ : failed++;

  // Test 2: 认证状态（未初始化或已锁定）
  await test('Get auth status', async () => {
    const status = await client.getStatus();
    // 应该是 locked: true (401) 或 unlocked: false
    if ('locked' in status) {
      assertEqual(status.locked, true);
    }
  }) ? passed++ : failed++;

  // Test 3: 标签列表
  await test('Get tags list', async () => {
    const result = await client.getTags();
    assertEqual(typeof result.total, 'number');
    assertEqual(Array.isArray(result.data), true);
  }) ? passed++ : failed++;

  // Test 4: 关联列表
  await test('Get relations list', async () => {
    const result = await client.getRelations();
    assertEqual(typeof result.total, 'number');
    assertEqual(Array.isArray(result.data), true);
  }) ? passed++ : failed++;

  // Test 5: 统计信息
  await test('Get stats', async () => {
    const stats = await client.getStats();
    assertEqual(typeof stats.totalBookmarks, 'number');
    assertEqual(typeof stats.totalTags, 'number');
    assertEqual(typeof stats.totalRelations, 'number');
    assertEqual(typeof stats.totalAccounts, 'number');
    assertEqual(Array.isArray(stats.mostUsedTags), true);
    assertEqual(Array.isArray(stats.recentlyUsed), true);
  }) ? passed++ : failed++;

  console.log(`\n========== Results ==========`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`==============================`);

  if (failed > 0) {
    console.log('\n⚠️ Some tests failed. Make sure the backend server is running at http://127.0.0.1:51000');
  } else {
    console.log('\n✅ All tests passed!');
  }
}

// 导出测试函数供手动调用
(window as any).testApiClient = { client, runTests };

// 自动运行测试（可选）
console.log('Run tests with: testApiClient.runTests()');
