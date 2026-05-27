const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const existingAccountPath = path.join(__dirname, '..', 'shared', 'existing-account.js');
const routerPath = path.join(__dirname, '..', 'background', 'message-router.js');
const backgroundPath = path.join(__dirname, '..', 'background.js');
const routerSource = fs.readFileSync(routerPath, 'utf8');

const sandbox = {
  console,
  self: {},
  globalThis: {},
};
sandbox.globalThis = sandbox;
sandbox.self = sandbox;

vm.runInNewContext(fs.readFileSync(existingAccountPath, 'utf8'), sandbox, {
  filename: existingAccountPath,
});
vm.runInNewContext(routerSource, sandbox, {
  filename: routerPath,
});

function buildRouter(overrides = {}) {
  const calls = {
    persisted: [],
    state: [],
    broadcasts: [],
    nodeStatuses: [],
    registeredTabs: [],
    reset: [],
  };
  const state = {
    plusModeEnabled: true,
    plusPaymentMethod: 'paypal',
    signupMethod: 'email',
  };
  const deps = {
    addLog: async () => {},
    buildLuckmailSessionSettingsPayload: () => ({}),
    buildPersistentSettingsPayload: (input = {}) => {
      const output = {};
      if (Object.prototype.hasOwnProperty.call(input, 'existingAccountJson')) {
        output.existingAccountJson = String(input.existingAccountJson || '').trim();
      }
      return output;
    },
    buildExistingAccountUpdatesFromSettings: (settings = {}) => {
      const rawJson = String(settings.existingAccountJson || '').trim();
      if (!rawJson) {
        return {
          existingAccount: null,
          email: null,
          password: null,
          accountIdentifierType: null,
          accountIdentifier: '',
        };
      }
      const account = sandbox.MultiPageExistingAccount.parseExistingAccountJson(rawJson);
      return sandbox.MultiPageExistingAccount.buildExistingAccountState(account);
    },
    broadcastDataUpdate: (payload) => calls.broadcasts.push(payload),
    clearStopRequest: () => {},
    detectCurrentChatGptSessionStateForStart: async () => ({ loggedIn: false }),
    getState: async () => state,
    normalizeSignupMethod: (value = '') => String(value || '').trim().toLowerCase() === 'phone' ? 'phone' : 'email',
    preservePhoneReuseSettingsForPhoneSignup: () => {},
    resolveSignupMethod: (nextState = {}) => nextState.signupMethod || 'email',
    sanitizeDataUpdatePayloadForBroadcast: (payload = {}) => {
      const sanitized = { ...payload };
      delete sanitized.existingAccountJson;
      delete sanitized.password;
      if (sanitized.existingAccount && typeof sanitized.existingAccount === 'object' && !Array.isArray(sanitized.existingAccount)) {
        sanitized.existingAccount = {
          ...sanitized.existingAccount,
          password: '',
        };
      }
      return sanitized;
    },
    setPersistentSettings: async (updates) => calls.persisted.push(updates),
    registerTab: async (...args) => calls.registeredTabs.push(args),
    resetState: async () => calls.reset.push(true),
    setState: async (updates) => calls.state.push(updates),
    setNodeStatus: async (...args) => calls.nodeStatuses.push(args),
    validateModeSwitch: () => ({ ok: true, errors: [], normalizedUpdates: {} }),
    ...overrides,
  };
  return {
    calls,
    router: sandbox.MultiPageBackgroundMessageRouter.createMessageRouter(deps),
  };
}

function extractFunctionSource(source, functionName) {
  const start = source.indexOf(`async function ${functionName}`);
  assert.ok(start >= 0, `应存在 ${functionName}。`);
  const braceStart = source.indexOf('{', start);
  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    if (depth === 0) {
      return source.slice(start, index + 1);
    }
  }
  throw new Error(`无法提取 ${functionName}。`);
}

(async () => {
  const accountJson = JSON.stringify({
    email: ' AnnKim5690@outlook.com ',
    password: 'FlaDv$GGoxocBD3y',
    mailbox_url: ' http://ms.outlook007.cc/api/open/email/latest?email=AnnKim5690%40outlook.com ',
  });
  const { calls, router } = buildRouter();
  await router.handleMessage({
    type: 'SAVE_SETTING',
    payload: { existingAccountJson: accountJson },
  }, {});

  assert.strictEqual(calls.persisted.length, 1);
  assert.strictEqual(calls.persisted[0].existingAccountJson, accountJson.trim());
  assert.strictEqual(calls.state.length, 1);
  assert.strictEqual(calls.state[0].email, 'AnnKim5690@outlook.com');
  assert.strictEqual(calls.state[0].password, 'FlaDv$GGoxocBD3y');
  assert.strictEqual(calls.state[0].accountIdentifierType, 'email');
  assert.strictEqual(calls.state[0].accountIdentifier, 'AnnKim5690@outlook.com');
  assert.strictEqual(calls.broadcasts.length, 1);
  assert.ok(!Object.prototype.hasOwnProperty.call(calls.broadcasts[0], 'existingAccountJson'));
  assert.ok(!Object.prototype.hasOwnProperty.call(calls.broadcasts[0], 'password'));
  assert.strictEqual(calls.broadcasts[0].existingAccount.password, '');
  assert.ok(!JSON.stringify(calls.broadcasts[0]).includes('FlaDv$GGoxocBD3y'));
  assert.ok(!JSON.stringify(calls.broadcasts[0]).includes(accountJson));

  const invalid = buildRouter();
  await assert.rejects(
    () => invalid.router.handleMessage({
      type: 'SAVE_SETTING',
      payload: { existingAccountJson: '{"email":"a@example.com","password":"p"}' },
    }, {}),
    /账户 JSON 缺少 mailbox_url。/
  );
  assert.strictEqual(invalid.calls.persisted.length, 0);
  assert.strictEqual(invalid.calls.state.length, 0);
  assert.strictEqual(invalid.calls.broadcasts.length, 0);

  const autoRunState = {
    plusModeEnabled: true,
    plusPaymentMethod: 'paypal',
    signupMethod: 'email',
  };
  const autoRunCalls = {
    state: [],
    loops: [],
  };
  const autoRun = buildRouter({
    getPendingAutoRunTimerPlan: () => null,
    getState: async () => autoRunState,
    normalizeRunCount: (value) => Math.max(1, Number(value) || 1),
    setState: async (updates) => {
      autoRunCalls.state.push(updates);
      Object.assign(autoRunState, updates);
    },
    startAutoRunLoop: (...args) => autoRunCalls.loops.push(args),
    validateAutoRunStart: () => ({ ok: true, errors: [] }),
  });
  await autoRun.router.handleMessage({
    type: 'AUTO_RUN',
    source: 'sidepanel',
    payload: {
      totalRuns: 1,
      existingAccountJson: accountJson,
    },
  }, {});
  assert.strictEqual(autoRunState.existingAccount.email, 'AnnKim5690@outlook.com');
  assert.strictEqual(autoRunState.existingAccount.password, 'FlaDv$GGoxocBD3y');
  assert.strictEqual(autoRunState.email, 'AnnKim5690@outlook.com');
  assert.strictEqual(autoRunCalls.loops.length, 1);
  assert.strictEqual(autoRunCalls.loops[0][1].mode, 'restart', '账户 JSON 非空时必须从首节点重新登录，不能复用旧登录态。');

  const loggedInAutoRunCalls = {
    loops: [],
  };
  const loggedInAutoRun = buildRouter({
    detectCurrentChatGptSessionStateForStart: async () => ({
      loggedIn: true,
      confidence: 'session',
      accessToken: '测试-access-token',
      tabId: 88,
      url: 'https://chatgpt.com/',
    }),
    getPendingAutoRunTimerPlan: () => null,
    normalizeRunCount: (value) => Math.max(1, Number(value) || 1),
    startAutoRunLoop: (...args) => loggedInAutoRunCalls.loops.push(args),
    validateAutoRunStart: () => ({ ok: true, errors: [] }),
  });
  await loggedInAutoRun.router.handleMessage({
    type: 'AUTO_RUN',
    source: 'sidepanel',
    payload: {
      totalRuns: 1,
      existingAccountJson: '',
    },
  }, {});
  assert.deepStrictEqual(loggedInAutoRun.calls.nodeStatuses, [
    ['open-chatgpt', 'completed'],
    ['existing-account-login', 'skipped'],
    ['fetch-existing-login-code', 'skipped'],
  ]);
  assert.deepStrictEqual(loggedInAutoRun.calls.registeredTabs[0], ['signup-page', 88]);
  assert.strictEqual(loggedInAutoRunCalls.loops[0][1].mode, 'continue', '账户 JSON 为空且已登录时应从 Checkout 继续，避免清理 cookies。');

  const loggedOutAutoRun = buildRouter({
    detectCurrentChatGptSessionStateForStart: async () => ({
      loggedIn: false,
      confidence: 'session',
      accessToken: '',
    }),
    getPendingAutoRunTimerPlan: () => null,
    validateAutoRunStart: () => ({ ok: true, errors: [] }),
  });
  await assert.rejects(
    () => loggedOutAutoRun.router.handleMessage({
      type: 'AUTO_RUN',
      source: 'sidepanel',
      payload: {
        totalRuns: 1,
        existingAccountJson: '',
      },
    }, {}),
    /账户 JSON 为空，且当前窗口未检测到已登录 ChatGPT 会话/
  );
  assert.ok(
    !routerSource.includes('确保认证页仍然打开并停留在验证码页'),
    '手动创建 Plus Checkout 不应再强制依赖旧认证标签页。'
  );

  const backgroundSource = fs.readFileSync(backgroundPath, 'utf8');
  assert.ok(
    /plusCheckoutCloudConversionEnabled:\s*true/.test(backgroundSource),
    '后台持久化默认配置应默认开启云端支付转换。'
  );
  assert.ok(
    /const BUILTIN_PLUS_CHECKOUT_CLOUD_CONVERSION_API_URL = 'https:\/\/payurl\.ark2\.cn\/api\/checkout';/.test(backgroundSource),
    '后台默认云端支付转换地址应使用 payurl 接口。'
  );
  assert.ok(
    /const BUILTIN_PLUS_CHECKOUT_CLOUD_CONVERSION_API_KEY = '';/.test(backgroundSource),
    '默认云端支付转换不应再携带旧内置 API Key。'
  );
  const importStart = backgroundSource.indexOf('async function importSettingsBundle(configBundle)');
  const parseIndex = backgroundSource.indexOf('buildExistingAccountUpdatesFromSettings(importedSettings)', importStart);
  const persistIndex = backgroundSource.indexOf('await setPersistentSettings(importedSettings)', importStart);
  assert.ok(importStart >= 0, '应存在 importSettingsBundle。');
  assert.ok(parseIndex >= 0, '导入配置应解析已有账户 JSON。');
  assert.ok(persistIndex >= 0, '导入配置应持久化配置。');
  assert.ok(parseIndex < persistIndex, '导入配置必须在落盘前解析已有账户 JSON。');

  const importCalls = {
    persisted: [],
    state: [],
    broadcasts: [],
  };
  const importSandbox = {
    Object,
    Number,
    Error,
    SETTINGS_EXPORT_SCHEMA_VERSION: 1,
    DEFAULT_REGISTRATION_EMAIL_STATE: {},
    ensureManualInteractionAllowed: async () => ({ nodeStatuses: {} }),
    buildPersistentSettingsPayload: () => ({
      existingAccountJson: '{"email":"a@example.com","password":"p"}',
    }),
    validateModeSwitchState: () => ({ ok: true, errors: [], normalizedUpdates: {} }),
    resolveSignupMethod: () => 'email',
    buildExistingAccountUpdatesFromSettings: (settings = {}) => {
      const rawJson = String(settings.existingAccountJson || '').trim();
      const account = sandbox.MultiPageExistingAccount.parseExistingAccountJson(rawJson);
      return sandbox.MultiPageExistingAccount.buildExistingAccountState(account);
    },
    setPersistentSettings: async (updates) => importCalls.persisted.push(updates),
    setState: async (updates) => importCalls.state.push(updates),
    broadcastDataUpdate: (payload) => importCalls.broadcasts.push(payload),
    sanitizeDataUpdatePayloadForBroadcast: (payload) => payload,
    getState: async () => ({}),
  };
  const importSettingsBundle = vm.runInNewContext(
    `(${extractFunctionSource(backgroundSource, 'importSettingsBundle')})`,
    importSandbox,
    { filename: backgroundPath }
  );
  await assert.rejects(
    () => importSettingsBundle({
      schemaVersion: 1,
      settings: { existingAccountJson: '{"email":"a@example.com","password":"p"}' },
    }),
    /账户 JSON 缺少 mailbox_url。/
  );
  assert.strictEqual(importCalls.persisted.length, 0);
  assert.strictEqual(importCalls.state.length, 0);
  assert.strictEqual(importCalls.broadcasts.length, 0);

  console.log('后台已有账户设置测试通过');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
