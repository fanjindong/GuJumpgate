const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const rootDir = path.join(__dirname, '..');
const executorPath = path.join(rootDir, 'background', 'steps', 'create-plus-checkout.js');

assert.ok(
  fs.existsSync(executorPath),
  '应存在 create-plus-checkout 后台执行器文件。'
);

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

vm.runInNewContext(fs.readFileSync(executorPath, 'utf8'), sandbox, {
  filename: executorPath,
});

assert.ok(
  sandbox.MultiPageBackgroundPlusCheckoutCreate?.createPlusCheckoutCreateExecutor,
  '应导出 createPlusCheckoutCreateExecutor。'
);

function normalizeForAssert(value) {
  return JSON.parse(JSON.stringify(value));
}

function collectAssertion(errors, description, assertion) {
  try {
    assertion();
  } catch (error) {
    errors.push(`${description}: ${error.message}`);
  }
}

function createExecutorHarness(responseBody, options = {}) {
  const calls = {
    fetch: [],
    createdTabs: [],
    completed: [],
    registeredTabs: [],
    logs: [],
    messages: [],
    state: [],
    updatedTabs: [],
  };
  const tabStore = new Map();

  const chrome = {
    tabs: {
      update: async (tabId, patch) => {
        calls.updatedTabs.push([tabId, normalizeForAssert(patch)]);
        const current = tabStore.get(tabId) || { id: tabId };
        const next = { ...current, ...patch };
        tabStore.set(tabId, next);
        return next;
      },
      get: async (tabId) => tabStore.get(tabId) || null,
    },
  };
  const initialTabs = Array.isArray(options.initialTabs) ? options.initialTabs : [];
  for (const tab of initialTabs) {
    if (Number.isInteger(tab?.id)) {
      tabStore.set(tab.id, { ...tab });
    }
  }

  const executor = sandbox.MultiPageBackgroundPlusCheckoutCreate.createPlusCheckoutCreateExecutor({
    addLog: async (...args) => calls.logs.push(normalizeForAssert(args)),
    chrome,
    completeNodeFromBackground: async (...args) => calls.completed.push(normalizeForAssert(args)),
    createAutomationTab: async (options) => {
      calls.createdTabs.push(normalizeForAssert(options));
      const tab = { id: 1001, url: options.url, active: Boolean(options.active) };
      tabStore.set(tab.id, tab);
      return tab;
    },
    getTabId: async (source) => {
      if (options.tabIds && Object.prototype.hasOwnProperty.call(options.tabIds, source)) {
        return options.tabIds[source];
      }
      return 0;
    },
    ensureContentScriptReadyOnTabUntilStopped: async () => {},
    fetch: async (url, options) => {
      const sanitizedOptions = {
        ...options,
        signal: options?.signal ? '[AbortSignal]' : undefined,
      };
      calls.fetch.push([url, normalizeForAssert(sanitizedOptions)]);
      return {
        ok: options.responseOk !== undefined ? Boolean(options.responseOk) : true,
        status: Number(options.responseStatus) || 200,
        json: async () => responseBody,
      };
    },
    isTabAlive: async (source) => {
      if (options.aliveSources && Object.prototype.hasOwnProperty.call(options.aliveSources, source)) {
        return Boolean(options.aliveSources[source]);
      }
      return false;
    },
    registerTab: async (...args) => calls.registeredTabs.push(normalizeForAssert(args)),
    sendTabMessageUntilStopped: async (...args) => {
      calls.messages.push(normalizeForAssert(args));
      if (typeof options.onMessage === 'function') {
        return options.onMessage(...args);
      }
      return { accessToken: '测试-access-token' };
    },
    setState: async (patch) => calls.state.push(normalizeForAssert(patch)),
    sleepWithStop: async () => {},
    waitForTabCompleteUntilStopped: async () => {},
    waitForTabUrlMatchUntilStopped: async (tabId, matcher) => {
      const tab = tabStore.get(tabId);
      return tab && matcher(tab.url || '', tab) ? tab : null;
    },
  });

  return { calls, executor };
}

function createDefaultState() {
  return {
    plusPaymentMethod: 'paypal',
    plusCheckoutCloudConversionEnabled: true,
    plusHostedCheckoutIsFinalStep: true,
  };
}

async function runDefaultRequestTest() {
  const { calls, executor } = createExecutorHarness({
    url: 'https://pay.openai.com/c/pay/hosted-long-link',
    openai_payurl: 'https://pay.openai.com/c/pay/fallback-link',
  });
  const state = createDefaultState();

  const errors = [];
  try {
    await executor.executePlusCheckoutCreate(state);
  } catch (error) {
    errors.push(`执行器不应失败: ${error?.message || String(error)}`);
  }

  const fetchCall = calls.fetch[0];
  collectAssertion(errors, '应调用云端支付转换接口', () => {
    assert.ok(fetchCall);
  });

  if (fetchCall) {
    const [requestUrl, requestOptions] = fetchCall;
    collectAssertion(errors, '默认请求 URL', () => {
      assert.strictEqual(requestUrl, 'https://payurl.ark2.cn/api/checkout');
    });
    collectAssertion(errors, '请求 method', () => {
      assert.strictEqual(requestOptions.method, 'POST');
    });
    collectAssertion(errors, '请求 Accept', () => {
      assert.strictEqual(requestOptions.headers.Accept, '*/*');
    });
    collectAssertion(errors, '请求 Content-Type', () => {
      assert.strictEqual(requestOptions.headers['Content-Type'], 'application/json');
    });
    collectAssertion(errors, '请求 Origin', () => {
      assert.strictEqual(requestOptions.headers.Origin, 'https://payurl.ark2.cn');
    });
    collectAssertion(errors, '请求 Referer', () => {
      assert.strictEqual(requestOptions.headers.Referer, 'https://payurl.ark2.cn/');
    });
    collectAssertion(errors, '默认不携带 X-API-Key', () => {
      assert.ok(!Object.prototype.hasOwnProperty.call(requestOptions.headers, 'X-API-Key'));
    });
    collectAssertion(errors, '请求体', () => {
      assert.deepStrictEqual(JSON.parse(requestOptions.body), {
        token: '测试-access-token',
        plan: 'plus',
        checkout_ui_mode: 'hosted',
        ui_language: 'en',
        country: 'US',
        currency: 'USD',
        proxy: '',
        use_promo: true,
        promo_code: 'STRIPEATLASGPT4BIZ050126',
        workspace_name: 'linux-do',
        seat_quantity: 2,
      });
    });
  }

  collectAssertion(errors, '打开的 tab URL', () => {
    const openedPayUrl = calls.updatedTabs.find(([, patch]) => patch.url)?.[1]?.url;
    assert.strictEqual(openedPayUrl, 'https://pay.openai.com/c/pay/hosted-long-link');
  });
  collectAssertion(errors, '创建节点应立即完成', () => {
    assert.deepStrictEqual(calls.completed[0], [
      'plus-checkout-create',
      {
        plusCheckoutCountry: 'US',
        plusCheckoutCurrency: 'USD',
      },
    ]);
  });

  if (errors.length > 0) {
    assert.fail(`Plus Checkout payurl API 断言失败：\n- ${errors.join('\n- ')}`);
  }
}

async function runReusableSignupTabPreferredTest() {
  const { calls, executor } = createExecutorHarness({
    url: 'https://pay.openai.com/c/pay/reused-tab-link',
    country: 'US',
    currency: 'USD',
  }, {
    initialTabs: [
      { id: 77, url: 'https://chatgpt.com/', status: 'complete', active: true },
    ],
    tabIds: { 'signup-page': 77 },
    aliveSources: { 'signup-page': true },
  });

  await executor.executePlusCheckoutCreate(createDefaultState());

  assert.strictEqual(calls.createdTabs.length, 0, '可复用的登录后 ChatGPT 标签页存在时不应新建标签页。');
  assert.deepStrictEqual(
    calls.registeredTabs[0],
    ['plus-checkout', 77],
    '复用登录标签页后应登记为 plus-checkout，方便后续步骤接管。'
  );
  assert.strictEqual(
    calls.updatedTabs.find(([, patch]) => patch.url)?.[0],
    77,
    '支付链接应在复用的 ChatGPT 标签页打开。'
  );
}

async function runReusableSignupTabFallsBackWhenTokenMissingTest() {
  let messageCount = 0;
  const { calls, executor } = createExecutorHarness({
    url: 'https://pay.openai.com/c/pay/fallback-tab-link',
    country: 'US',
    currency: 'USD',
  }, {
    initialTabs: [
      { id: 77, url: 'https://chatgpt.com/', status: 'complete', active: true },
    ],
    tabIds: { 'signup-page': 77 },
    aliveSources: { 'signup-page': true },
    onMessage: async () => {
      messageCount += 1;
      return messageCount === 1
        ? { accessToken: '' }
        : { accessToken: '测试-access-token' };
    },
  });

  await executor.executePlusCheckoutCreate(createDefaultState());

  assert.strictEqual(calls.createdTabs.length, 1, '复用标签页读不到 accessToken 时应回退新开 ChatGPT 标签页。');
  assert.ok(
    calls.logs.some((args) => String(args[0] || '').includes('复用登录标签页失败')),
    '复用失败时应输出中文日志，便于用户理解为什么回退新开页面。'
  );
  assert.strictEqual(
    calls.updatedTabs.find(([, patch]) => patch.url)?.[0],
    1001,
    '回退后应在新建标签页打开支付链接。'
  );
}

async function runOpenAiPayurlFallbackTest() {
  const { calls, executor } = createExecutorHarness({
    openai_payurl: 'https://pay.openai.com/c/pay/openai-payurl-link',
    checkout_url: 'https://pay.openai.com/c/pay/checkout-url-link',
  });

  await executor.executePlusCheckoutCreate(createDefaultState());

  const openedPayUrl = calls.updatedTabs.find(([, patch]) => patch.url)?.[1]?.url;
  assert.strictEqual(
    openedPayUrl,
    'https://pay.openai.com/c/pay/openai-payurl-link',
    '响应同时只有 openai_payurl 和 checkout_url 时，应优先打开 openai_payurl。'
  );
}

async function runMissingLinkFailureTest() {
  const { calls, executor } = createExecutorHarness({
    message: '没有返回支付链接',
  });

  await assert.rejects(
    () => executor.executePlusCheckoutCreate(createDefaultState()),
    /云端支付转换失败：没有返回支付链接/
  );

  assert.strictEqual(
    calls.updatedTabs.length,
    0,
    '缺少支付链接时不应调用 tabs.update。'
  );
}

async function runCustomApiCompatibilityTest() {
  const { calls, executor } = createExecutorHarness({
    preferredCheckoutUrl: 'https://pay.openai.com/c/pay/custom-service-link',
    checkoutSessionId: 'cs_custom',
    country: 'US',
    currency: 'USD',
  });
  const state = {
    ...createDefaultState(),
    plusCheckoutCloudConversionApiUrl: 'https://custom.example.test/api/checkout',
    plusCheckoutCloudConversionApiKey: '自定义-key',
  };

  await executor.executePlusCheckoutCreate(state);

  const fetchCall = calls.fetch[0];
  assert.ok(fetchCall, '应调用自定义云端支付转换接口。');
  const [requestUrl, requestOptions] = fetchCall;
  assert.strictEqual(
    requestUrl,
    'https://custom.example.test/api/checkout',
    '应请求自定义云端支付转换地址。'
  );
  assert.strictEqual(
    requestOptions.headers.Accept,
    'application/json',
    '自定义服务请求应声明接受 JSON 响应。'
  );
  assert.strictEqual(
    requestOptions.headers.Origin,
    'https://custom.example.test',
    '自定义服务请求 Origin 应来自自定义地址。'
  );
  assert.strictEqual(
    requestOptions.headers.Referer,
    'https://custom.example.test/',
    '自定义服务请求 Referer 应来自自定义地址。'
  );
  assert.strictEqual(
    requestOptions.headers['X-API-Key'],
    '自定义-key',
    '自定义服务请求应携带配置的 API Key。'
  );
  assert.deepStrictEqual(
    JSON.parse(requestOptions.body),
    {
      accessToken: '测试-access-token',
      paymentMethod: 'paypal',
      country: 'US',
      currency: 'USD',
    },
    '自定义服务请求体应使用兼容字段。'
  );

  const openedPayUrl = calls.updatedTabs.find(([, patch]) => patch.url)?.[1]?.url;
  assert.strictEqual(
    openedPayUrl,
    'https://pay.openai.com/c/pay/custom-service-link',
    '应打开自定义服务返回的 preferredCheckoutUrl。'
  );
}

async function runLegacyBuiltinStateFallsBackToPayurlTest() {
  const { calls, executor } = createExecutorHarness({
    url: 'https://pay.openai.com/c/pay/migrated-payurl-link',
  });
  const state = {
    ...createDefaultState(),
    plusCheckoutCloudConversionApiUrl: 'https://gujumpgate.zg.fyi/api/checkout',
  };

  await executor.executePlusCheckoutCreate(state);

  const fetchCall = calls.fetch[0];
  assert.ok(fetchCall, '应调用云端支付转换接口。');
  assert.strictEqual(
    fetchCall[0],
    'https://payurl.ark2.cn/api/checkout',
    '旧内置云端地址应视为默认值并迁移到 payurl。'
  );
  assert.ok(
    !Object.prototype.hasOwnProperty.call(fetchCall[1].headers, 'X-API-Key'),
    '旧内置地址迁移到 payurl 后默认不应携带 X-API-Key。'
  );
}

async function runNonStringLinkIsIgnoredTest() {
  const { calls, executor } = createExecutorHarness({
    url: { href: 'https://pay.openai.com/c/pay/object-link' },
    openai_payurl: ['https://pay.openai.com/c/pay/array-link'],
  });

  await assert.rejects(
    () => executor.executePlusCheckoutCreate(createDefaultState()),
    /云端支付转换失败：没有返回支付链接/
  );

  assert.strictEqual(
    calls.updatedTabs.length,
    0,
    '非字符串支付链接字段应被忽略，不应打开 [object Object] 等无效 URL。'
  );
}

async function runCloudFailureRetriesThreeTimesTest() {
  const { calls, executor } = createExecutorHarness({
    message: '没有返回支付链接',
  });

  await assert.rejects(
    () => executor.executePlusCheckoutCreate(createDefaultState()),
    /云端支付转换失败：没有返回支付链接/
  );

  assert.strictEqual(
    calls.fetch.length,
    3,
    '云端支付转换失败时应在步骤 6 内部最多请求 3 次接口，避免直接交给外层重建 checkout。'
  );
  assert.strictEqual(
    calls.updatedTabs.length,
    0,
    '重试全部失败时不应打开订阅页。'
  );
}

async function runCloudFailureLogsRequestBodyTest() {
  const { calls, executor } = createExecutorHarness({
    error: '代理连接被对端断开',
  }, {
    responseOk: false,
    responseStatus: 502,
  });

  await assert.rejects(
    () => executor.executePlusCheckoutCreate(createDefaultState()),
    /云端支付转换失败：代理连接被对端断开/
  );

  const requestBodyLog = calls.logs.find((args) => String(args[0] || '').includes('云端支付转换请求体'));
  assert.ok(requestBodyLog, '云端支付转换报错时应记录请求体。');
  const logMessage = String(requestBodyLog[0] || '');
  assert.ok(
    logMessage.includes('"token":"测试-access-token"'),
    '请求体日志应按要求明文包含 token。'
  );
  assert.ok(
    logMessage.includes('"promo_code":"STRIPEATLASGPT4BIZ050126"'),
    '请求体日志应包含优惠参数，便于排查优惠价问题。'
  );
  assert.strictEqual(
    requestBodyLog[1],
    'error',
    '请求体日志应按错误级别输出。'
  );
}

async function runTests() {
  await runDefaultRequestTest();
  await runReusableSignupTabPreferredTest();
  await runReusableSignupTabFallsBackWhenTokenMissingTest();
  await runOpenAiPayurlFallbackTest();
  await runMissingLinkFailureTest();
  await runCustomApiCompatibilityTest();
  await runLegacyBuiltinStateFallsBackToPayurlTest();
  await runNonStringLinkIsIgnoredTest();
  await runCloudFailureRetriesThreeTimesTest();
  await runCloudFailureLogsRequestBodyTest();
  console.log('payurl 云端支付转换测试通过');
}

runTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
