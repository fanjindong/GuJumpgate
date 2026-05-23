const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const rootDir = path.join(__dirname, '..');
const backgroundPath = path.join(rootDir, 'background.js');

function createChromeStubFunction() {
  return new Proxy(function chromeStubFunction() {}, {
    get(target, prop) {
      if (prop === 'addListener') return () => {};
      if (prop === 'removeListener') return () => {};
      if (prop === 'hasListener') return () => false;
      if (prop === 'onUpdated') {
        return {
          addListener: (listener) => {
            // 标签页加载完成事件决定步骤 1 是否会继续，测试里立即触发可避免依赖 30 秒超时兜底。
            setTimeout(() => listener(1, { status: 'complete' }, { id: 1, url: 'https://chatgpt.com/' }), 0);
          },
          removeListener: () => {},
          hasListener: () => false,
        };
      }
      if (prop === 'getManifest') return () => ({ version: 'test' });
      if (prop === 'getURL') return (filePath) => `chrome-extension://test/${filePath}`;
      if (prop === 'getAllCookieStores') return async () => [{ id: 'default' }];
      if (prop === 'getAll') return async () => [];
      if (prop === 'remove') return async () => true;
      if (prop === 'removeCookies') return async () => {};
      if (prop === 'query') return async () => [];
      if (prop === 'create') return async (details = {}) => ({ id: 1, url: details.url || '', status: 'complete' });
      if (prop === 'update') return async (tabId, details = {}) => ({ id: tabId, url: details.url || 'https://chatgpt.com/', status: 'complete' });
      if (prop === 'get') return async (tabId) => ({ id: tabId, url: 'https://chatgpt.com/', status: 'complete' });
      if (prop === 'executeScript') return async () => [{}];
      if (prop === 'sendMessage') return async () => ({ ok: true, source: 'signup-page' });
      if (prop === 'local' || prop === 'session') {
        target[prop] = target[prop] || {
          get: async () => ({}),
          set: async () => {},
          clear: async () => {},
          remove: async () => {},
          setAccessLevel: async () => {},
        };
        return target[prop];
      }
      target[prop] = target[prop] || createChromeStubFunction();
      return target[prop];
    },
    apply() {
      // 顶层初始化会调用部分 chrome Promise API；返回 Promise 可暴露真实启动期引用错误。
      return Promise.resolve({});
    },
  });
}

function loadBackgroundInSandbox() {
  const sandbox = {
    AbortController,
    Blob,
    URL,
    URLSearchParams,
    atob: (value) => Buffer.from(value, 'base64').toString('binary'),
    btoa: (value) => Buffer.from(value, 'binary').toString('base64'),
    chrome: createChromeStubFunction(),
    clearInterval,
    clearTimeout,
    console,
    fetch: async () => ({
      ok: false,
      status: 500,
      json: async () => ({}),
      text: async () => '',
    }),
    setInterval,
    setTimeout,
  };
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;

  let context = null;
  sandbox.importScripts = (...files) => {
    for (const file of files) {
      const fullPath = path.join(rootDir, file);
      vm.runInContext(fs.readFileSync(fullPath, 'utf8'), context, { filename: fullPath });
    }
  };

  context = vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(backgroundPath, 'utf8'), context, { filename: backgroundPath });
  return sandbox;
}

const backgroundSource = fs.readFileSync(backgroundPath, 'utf8');
for (const removedSymbol of [
  'NORMAL_PHONE_STEP_DEFINITIONS',
  'PLUS_PAYPAL_PHONE_STEP_DEFINITIONS',
  'PLUS_PAYPAL_SUB2API_SESSION_STEP_DEFINITIONS',
  'PLUS_PAYPAL_CPA_SESSION_STEP_DEFINITIONS',
  'PLUS_ACCOUNT_ACCESS_STRATEGY_SUB2API_CODEX_SESSION',
  'PLUS_ACCOUNT_ACCESS_STRATEGY_CPA_CODEX_SESSION',
]) {
  assert.ok(!backgroundSource.includes(removedSymbol), `后台不应再引用已删除链路符号：${removedSymbol}`);
}

(async () => {
  let sandbox = null;
  assert.doesNotThrow(() => {
    sandbox = loadBackgroundInSandbox();
  }, '后台 Service Worker 启动期不应引用已删除链路。');

  assert.strictEqual(typeof sandbox.executeStep1, 'function', '后台应暴露步骤 1 执行函数用于旧版按钮兼容。');

  // 精简注册链路后步骤 1 仍是已有账户 Plus 自动运行的入口，必须直接打开官网，而不能依赖已删除的注册 helper。
  await assert.doesNotReject(
    () => sandbox.executeStep1(),
    '步骤 1 不应再读取已删除注册 helper 的 openSignupEntryTab。'
  );
  console.log('后台精简链路启动测试通过');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
