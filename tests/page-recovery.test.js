const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const rootDir = path.join(__dirname, '..');
const stepDefinitionsPath = path.join(rootDir, 'data', 'step-definitions.js');
const pageRecoveryPath = path.join(rootDir, 'background', 'page-recovery.js');
const sandbox = {
  self: {},
  globalThis: {},
  URL,
};
sandbox.globalThis = sandbox;
sandbox.self = sandbox;
vm.runInNewContext(fs.readFileSync(stepDefinitionsPath, 'utf8'), sandbox, { filename: stepDefinitionsPath });
vm.runInNewContext(fs.readFileSync(pageRecoveryPath, 'utf8'), sandbox, { filename: pageRecoveryPath });

const definitions = sandbox.MultiPageStepDefinitions;
const recoveryModule = sandbox.MultiPageBackgroundPageRecovery;

function normalizeForAssert(value) {
  return JSON.parse(JSON.stringify(value));
}

function createManagerHarness(options = {}) {
  const calls = {
    logs: [],
    registerTab: [],
    setNodeStatus: [],
    setState: [],
    startAutoRunLoop: [],
  };
  let state = {
    plusModeEnabled: true,
    plusPaymentMethod: 'paypal',
    nodeStatuses: {},
    ...(options.state || {}),
  };
  const activeTab = options.activeTab || null;
  const manager = recoveryModule.createPageRecoveryManager({
    addLog: async (...args) => calls.logs.push(args),
    chrome: {
      tabs: {
        query: async () => (activeTab ? [activeTab] : []),
      },
    },
    detectChatGptSessionState: options.detectChatGptSessionState || (async () => ({ loggedIn: false })),
    getNodeDefinitionsForState: (currentState) => definitions.getNodes({
      plusModeEnabled: true,
      plusPaymentMethod: currentState.plusPaymentMethod || 'paypal',
    }),
    getState: async () => state,
    registerTab: async (...args) => calls.registerTab.push(args),
    setNodeStatus: async (nodeId, status) => {
      calls.setNodeStatus.push([nodeId, status]);
      state = {
        ...state,
        currentNodeId: nodeId,
        nodeStatuses: {
          ...(state.nodeStatuses || {}),
          [nodeId]: status,
        },
      };
    },
    setState: async (patch) => {
      calls.setState.push(patch);
      state = { ...state, ...patch };
    },
    startAutoRunLoop: (...args) => calls.startAutoRunLoop.push(args),
  });
  return { calls, manager, getState: () => state };
}

async function runLoggedInSuggestionTest() {
  const { manager } = createManagerHarness({
    activeTab: { id: 101, url: 'https://chatgpt.com/' },
    detectChatGptSessionState: async () => ({
      loggedIn: true,
      confidence: 'session',
      accessToken: '测试-access-token',
    }),
    state: {
      nodeStatuses: {
        'open-chatgpt': 'completed',
        'existing-account-login': 'pending',
        'fetch-existing-login-code': 'pending',
      },
    },
  });
  const result = await manager.getPageRecoveryState();
  assert.strictEqual(result.recoverySuggestion.kind, 'skip-auth-logged-in');
  assert.strictEqual(result.pages.find((page) => page.pageId === 'auth').status, 'needs_action');
}

async function runLoggedOutHomeDoesNotSkipAuthTest() {
  const { manager } = createManagerHarness({
    activeTab: { id: 102, url: 'https://chatgpt.com/' },
    detectChatGptSessionState: async () => ({
      loggedIn: false,
      confidence: 'session',
      accessToken: '',
    }),
    state: {
      nodeStatuses: {
        'open-chatgpt': 'completed',
        'existing-account-login': 'pending',
        'fetch-existing-login-code': 'pending',
      },
    },
  });
  const result = await manager.getPageRecoveryState();
  assert.strictEqual(result.recoverySuggestion, null, '未登录的 chatgpt.com 首页不应提示跳过认证。');
}

async function runCheckoutAdoptTest() {
  const { calls, manager, getState } = createManagerHarness({
    activeTab: { id: 202, url: 'https://pay.openai.com/c/pay/cs_test' },
    state: {
      nodeStatuses: {
        'open-chatgpt': 'completed',
        'existing-account-login': 'skipped',
        'fetch-existing-login-code': 'skipped',
        'plus-checkout-create': 'pending',
        'hosted-checkout-submit': 'pending',
      },
    },
  });

  const result = await manager.resumeFromPage({
    pageId: 'checkout',
    suggestionKind: 'adopt-current-checkout',
  });

  assert.strictEqual(result.ok, true);
  assert.strictEqual(getState().plusCheckoutTabId, 202);
  assert.deepStrictEqual(calls.registerTab[0], ['plus-checkout', 202]);
  assert.deepStrictEqual(calls.setNodeStatus[0], ['plus-checkout-create', 'completed']);
  assert.deepStrictEqual(normalizeForAssert(calls.startAutoRunLoop[0]), [1, { mode: 'continue' }]);
}

async function runPayPalAdoptTest() {
  const { calls, manager, getState } = createManagerHarness({
    activeTab: { id: 303, url: 'https://www.paypal.com/checkoutnow?token=BA-test' },
    state: {
      nodeStatuses: {
        'plus-checkout-create': 'completed',
        'hosted-checkout-submit': 'completed',
        'hosted-paypal-payment': 'pending',
      },
    },
  });

  await manager.resumeFromPage({
    pageId: 'paypal',
    suggestionKind: 'adopt-current-paypal',
  });

  assert.strictEqual(getState().plusCheckoutTabId, 303);
  assert.deepStrictEqual(calls.registerTab[0], ['paypal-flow', 303]);
  assert.deepStrictEqual(normalizeForAssert(calls.startAutoRunLoop[0]), [1, { mode: 'continue' }]);
}

async function runPayPalPayUrlAdoptTest() {
  const { calls, manager, getState } = createManagerHarness({
    activeTab: { id: 304, url: 'https://www.paypal.com/pay?ssrt=1779786558630&token=BA-79B309697D577725L&ul=1' },
    state: {
      nodeStatuses: {
        'plus-checkout-create': 'completed',
        'hosted-checkout-submit': 'completed',
        'hosted-paypal-payment': 'pending',
      },
    },
  });

  const recoveryState = await manager.getPageRecoveryState();
  assert.strictEqual(recoveryState.recoverySuggestion.kind, 'adopt-current-paypal');

  await manager.resumeFromPage({
    pageId: 'paypal',
    suggestionKind: 'adopt-current-paypal',
  });

  assert.strictEqual(getState().plusCheckoutTabId, 304);
  assert.deepStrictEqual(calls.registerTab[0], ['paypal-flow', 304]);
  assert.deepStrictEqual(normalizeForAssert(calls.startAutoRunLoop[0]), [1, { mode: 'continue' }]);
}

async function runFailedPageRefreshActionTest() {
  const { manager } = createManagerHarness({
    state: {
      nodeStatuses: {
        'fetch-existing-login-code': 'failed',
      },
    },
  });
  const recoveryState = await manager.getPageRecoveryState();
  assert.strictEqual(recoveryState.recoverySuggestion.kind, 'retry-page');
  assert.strictEqual(recoveryState.recoverySuggestion.secondaryAction, 'refresh');
}

async function runTests() {
  await runLoggedInSuggestionTest();
  await runLoggedOutHomeDoesNotSkipAuthTest();
  await runCheckoutAdoptTest();
  await runPayPalAdoptTest();
  await runPayPalPayUrlAdoptTest();
  await runFailedPageRefreshActionTest();
  console.log('页面恢复测试通过');
}

runTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
