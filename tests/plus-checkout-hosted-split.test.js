const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const rootDir = path.join(__dirname, '..');
const executorPath = path.join(rootDir, 'background', 'steps', 'create-plus-checkout.js');
const backgroundPath = path.join(rootDir, 'background.js');
const executorSource = fs.readFileSync(executorPath, 'utf8');
const backgroundSource = fs.readFileSync(backgroundPath, 'utf8');

const sandbox = {
  self: {},
  globalThis: {},
  URL,
  AbortController,
  Date,
  Math,
  Promise,
  JSON,
  String,
  Number,
  Boolean,
  Error,
  RegExp,
  setTimeout,
  clearTimeout,
};
sandbox.globalThis = sandbox;
sandbox.self = sandbox;

vm.runInNewContext(executorSource, sandbox, { filename: executorPath });

assert.ok(
  sandbox.MultiPageBackgroundPlusCheckoutCreate?.createPlusCheckoutCreateExecutor,
  '应导出 createPlusCheckoutCreateExecutor。'
);

function normalizeForAssert(value) {
  return JSON.parse(JSON.stringify(value));
}

function createHostedHarness(options = {}) {
  const calls = {
    completed: [],
    fetch: [],
    logs: [],
    messages: [],
    state: [],
  };
  const tabStore = new Map();
  for (const tab of options.initialTabs || []) {
    tabStore.set(tab.id, { ...tab });
  }

  const chrome = {
    tabs: {
      get: async (tabId) => tabStore.get(tabId) || null,
      update: async (tabId, patch) => {
        const current = tabStore.get(tabId) || { id: tabId };
        const next = { ...current, ...patch };
        tabStore.set(tabId, next);
        return next;
      },
    },
    storage: {
      local: {
        get: async () => ({}),
      },
    },
  };

  const executor = sandbox.MultiPageBackgroundPlusCheckoutCreate.createPlusCheckoutCreateExecutor({
    addLog: async (...args) => calls.logs.push(normalizeForAssert(args)),
    chrome,
    completeNodeFromBackground: async (...args) => calls.completed.push(normalizeForAssert(args)),
    ensureContentScriptReadyOnTabUntilStopped: async () => {},
    fetch: async (url, requestOptions) => {
      calls.fetch.push([url, normalizeForAssert(requestOptions || {})]);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          address: {
            Address: '123 Main St',
            City: 'New York',
            State_Full: 'New York',
            Zip_Code: '10001',
          },
        }),
        text: async () => '123456',
      };
    },
    getState: async () => options.state || {},
    sendTabMessageUntilStopped: async (tabId, source, message) => {
      calls.messages.push(normalizeForAssert([tabId, source, message]));
      if (typeof options.onMessage === 'function') {
        return options.onMessage({ tabStore, tabId, source, message, calls });
      }
      return {};
    },
    setState: async (patch) => calls.state.push(normalizeForAssert(patch)),
    sleepWithStop: async () => {},
    throwIfStopped: () => {},
    waitForTabCompleteUntilStopped: async () => {},
    waitForTabUrlMatchUntilStopped: async (tabId, matcher) => {
      const tab = tabStore.get(tabId) || null;
      return tab && matcher(tab.url || '', tab) ? tab : null;
    },
  });

  return { calls, executor, tabStore };
}

async function runHostedSubmitMissingTabTest() {
  const { executor } = createHostedHarness();

  await assert.rejects(
    () => executor.executeHostedCheckoutSubmit({}),
    /缺少 Plus Checkout 标签页，请先重新执行第 4 步/
  );
}

async function runHostedSubmitCompletesAfterPayPalTransitionTest() {
  const { calls, executor } = createHostedHarness({
    initialTabs: [
      { id: 201, url: 'https://pay.openai.com/c/pay/test', status: 'complete' },
    ],
    onMessage: async ({ tabStore, tabId, message }) => {
      if (message.type === 'RUN_HOSTED_OPENAI_CHECKOUT_STEP') {
        tabStore.set(tabId, {
          id: tabId,
          url: 'https://www.paypal.com/checkoutnow?token=BA-test',
          status: 'complete',
        });
        return { transitioned: true };
      }
      return {};
    },
  });

  await executor.executeHostedCheckoutSubmit({ plusCheckoutTabId: 201 });

  assert.deepStrictEqual(
    calls.completed[0],
    ['hosted-checkout-submit', { plusCheckoutTabId: 201 }],
    'hosted checkout 填写成功跳转 PayPal 后应完成第 5 步。'
  );
}

async function runHostedPayPalMissingTabTest() {
  const { executor } = createHostedHarness();

  await assert.rejects(
    () => executor.executeHostedPayPalPayment({}),
    /缺少 Plus Checkout 标签页，请先重新执行第 4 步/
  );
}

async function runHostedPayPalSuccessUrlCompletesDirectlyTest() {
  const { calls, executor } = createHostedHarness({
    initialTabs: [
      { id: 202, url: 'https://chatgpt.com/payments/success?session_id=cs_test', status: 'complete' },
    ],
  });

  await executor.executeHostedPayPalPayment({ plusCheckoutTabId: 202 });

  assert.deepStrictEqual(
    calls.completed[0],
    ['hosted-paypal-payment', { plusCheckoutTabId: 202 }],
    '已在成功页时第 6 步应直接完成。'
  );
}

async function runHostedPayPalFlowCompletesAfterSuccessTest() {
  const { calls, executor } = createHostedHarness({
    initialTabs: [
      { id: 203, url: 'https://www.paypal.com/checkoutnow?token=BA-test', status: 'complete' },
    ],
    onMessage: async ({ tabStore, tabId, message }) => {
      if (message.type === 'PAYPAL_HOSTED_GET_STATE') {
        return { hostedStage: 'review_consent' };
      }
      if (message.type === 'PAYPAL_RUN_HOSTED_CHECKOUT_STEP') {
        tabStore.set(tabId, {
          id: tabId,
          url: 'https://chatgpt.com/payments/success?session_id=cs_test',
          status: 'complete',
        });
        return { stage: 'review_consent' };
      }
      return {};
    },
  });

  await executor.executeHostedPayPalPayment({ plusCheckoutTabId: 203 });

  assert.deepStrictEqual(
    calls.completed[0],
    ['hosted-paypal-payment', { plusCheckoutTabId: 203 }],
    'PayPal hosted 支付链路完成后应完成第 6 步。'
  );
}

function assertBackgroundWiring() {
  assert.ok(
    backgroundSource.includes("'hosted-checkout-submit': (state) => plusCheckoutCreateExecutor.executeHostedCheckoutSubmit(state)"),
    'background.js 应注册 hosted-checkout-submit 后台执行器。'
  );
  assert.ok(
    backgroundSource.includes("'hosted-paypal-payment': (state) => plusCheckoutCreateExecutor.executeHostedPayPalPayment(state)"),
    'background.js 应注册 hosted-paypal-payment 后台执行器。'
  );
}

function assertHostedVerificationPopupDelayDefault() {
  assert.ok(
    executorSource.includes('const HOSTED_CHECKOUT_VERIFICATION_POPUP_DELAY_DEFAULT_SECONDS = 5;'),
    'Hosted Checkout 验证码弹窗等待默认值应为 5 秒。'
  );
  assert.ok(
    /hostedCheckoutVerificationPopupDelaySeconds:\s*5/.test(backgroundSource),
    '后台持久化设置中的验证码弹窗等待默认值应为 5 秒。'
  );
}

async function runTests() {
  assertBackgroundWiring();
  assertHostedVerificationPopupDelayDefault();
  await runHostedSubmitMissingTabTest();
  await runHostedSubmitCompletesAfterPayPalTransitionTest();
  await runHostedPayPalMissingTabTest();
  await runHostedPayPalSuccessUrlCompletesDirectlyTest();
  await runHostedPayPalFlowCompletesAfterSuccessTest();
  console.log('Plus hosted checkout 步骤拆分测试通过');
}

runTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
