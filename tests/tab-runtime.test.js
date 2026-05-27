const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const rootDir = path.join(__dirname, '..');
const runtimePath = path.join(rootDir, 'background', 'tab-runtime.js');
const sandbox = {
  self: {},
  globalThis: {},
  console,
  URL,
  Map,
  Set,
  Promise,
  Number,
  String,
  Boolean,
  Error,
  RegExp,
  Object,
  Array,
  setTimeout,
  clearTimeout,
};
sandbox.globalThis = sandbox;
sandbox.self = sandbox;

vm.runInNewContext(fs.readFileSync(runtimePath, 'utf8'), sandbox, { filename: runtimePath });

async function runCreateBeforeCleanupTest(forceNew) {
  const calls = [];
  let state = {
    sourceLastUrls: {
      'signup-page': 'https://chatgpt.com/',
    },
    tabRegistry: {},
  };
  const tabs = [
    { id: 1, url: 'https://chatgpt.com/', active: true },
  ];
  const chrome = {
    tabs: {
      create: async (properties) => {
        calls.push(['create', properties.url]);
        const tab = { id: 2, url: properties.url, active: Boolean(properties.active) };
        tabs.push(tab);
        return tab;
      },
      query: async () => tabs.filter((tab) => !tab.removed),
      remove: async (ids) => {
        calls.push(['remove', [...ids]]);
        for (const id of ids) {
          const tab = tabs.find((item) => item.id === id);
          if (tab) tab.removed = true;
        }
      },
      sendMessage: async () => ({ ok: true }),
    },
  };

  const runtime = sandbox.MultiPageBackgroundTabRuntime.createTabRuntime({
    addLog: async () => {},
    chrome,
    getSourceLabel: () => '认证页',
    getState: async () => state,
    isLocalhostOAuthCallbackUrl: () => false,
    isRetryableContentScriptTransportError: () => false,
    LOG_PREFIX: '[test]',
    matchesSourceUrlFamily: (_source, left, right) => String(left || '') === String(right || ''),
    setState: async (patch) => {
      state = { ...state, ...patch };
    },
    sleepWithStop: async () => {},
    STOP_ERROR_MESSAGE: 'STOP',
    throwIfStopped: () => {},
  });

  const tabId = await runtime.reuseOrCreateTab('signup-page', 'https://chatgpt.com/', { forceNew });
  assert.strictEqual(tabId, 2);
  assert.deepStrictEqual(calls[0], ['create', 'https://chatgpt.com/']);
  assert.deepStrictEqual(calls[1], ['remove', [1]]);
}

(async () => {
  await runCreateBeforeCleanupTest(true);
  await runCreateBeforeCleanupTest(false);
  console.log('标签运行时清理顺序测试通过');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
