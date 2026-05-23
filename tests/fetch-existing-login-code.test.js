const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const rootDir = path.join(__dirname, '..');
const backgroundPath = path.join(rootDir, 'background.js');
const signupPagePath = path.join(rootDir, 'content', 'signup-page.js');
const existingAccountPath = path.join(rootDir, 'shared', 'existing-account.js');
const executorPath = path.join(rootDir, 'background', 'steps', 'fetch-existing-login-code.js');

const backgroundSource = fs.readFileSync(backgroundPath, 'utf8');
const signupPageSource = fs.readFileSync(signupPagePath, 'utf8');

assert.ok(
  fs.existsSync(executorPath),
  '应存在 fetch-existing-login-code 后台执行器文件。'
);
assert.ok(
  backgroundSource.includes("'background/steps/fetch-existing-login-code.js'"),
  'background.js 应加载已有账户登录验证码步骤脚本。'
);
assert.ok(
  backgroundSource.includes('MultiPageBackgroundFetchExistingLoginCode?.createFetchExistingLoginCodeExecutor'),
  'background.js 应创建已有账户登录验证码执行器。'
);
assert.ok(
  backgroundSource.includes('sleepImpl: sleepWithStop'),
  'background.js 创建已有账户登录验证码执行器时应注入 sleepWithStop。'
);
assert.ok(
  backgroundSource.includes("'fetch-existing-login-code': (state) => fetchExistingLoginCodeExecutor.executeFetchExistingLoginCode(state)"),
  'background.js 应注册 fetch-existing-login-code 步骤执行器。'
);
assert.ok(
  signupPageSource.includes("'fetch-existing-login-code': (payload) => fillVerificationCode(3, payload)"),
  'signup-page.js 应复用现有验证码提交逻辑处理已有账户登录验证码。'
);

function extractFunctionSource(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  assert.ok(start >= 0, `应存在 ${functionName}。`);
  const signatureEnd = source.indexOf(') {', start);
  const braceStart = source.indexOf('{', signatureEnd >= 0 ? signatureEnd : start);
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

const verificationOutcomeSource = extractFunctionSource(signupPageSource, 'waitForVerificationSubmitOutcome');
assert.ok(
  verificationOutcomeSource.includes('step === 3 || step === 4'),
  '已有账户登录验证码提交后应像注册验证码一样识别 ChatGPT 已登录态。'
);

const sandbox = {
  console,
  self: {},
  globalThis: {},
  URL,
};
sandbox.globalThis = sandbox;
sandbox.self = sandbox;
vm.runInNewContext(fs.readFileSync(existingAccountPath, 'utf8'), sandbox, {
  filename: existingAccountPath,
});
vm.runInNewContext(fs.readFileSync(executorPath, 'utf8'), sandbox, {
  filename: executorPath,
});

assert.ok(
  sandbox.MultiPageBackgroundFetchExistingLoginCode?.createFetchExistingLoginCodeExecutor,
  '应导出 createFetchExistingLoginCodeExecutor。'
);

function createJsonResponse(payload, status = 200, ok = true) {
  return {
    ok,
    status,
    json: async () => payload,
  };
}

function createHarness(fetchResults, overrides = {}) {
  const calls = {
    completed: [],
    fetches: [],
    logs: [],
    messages: [],
    state: [],
  };
  const queue = Array.from(fetchResults);
  const executor = sandbox.MultiPageBackgroundFetchExistingLoginCode.createFetchExistingLoginCodeExecutor({
    addLog: async (...args) => calls.logs.push(args),
    completeNodeFromBackground: async (...args) => calls.completed.push(args),
    fetchImpl: async (...args) => {
      calls.fetches.push(args);
      const next = queue.shift();
      if (next instanceof Error) throw next;
      return next;
    },
    sendToContentScriptResilient: async (...args) => {
      calls.messages.push(args);
      return { success: true };
    },
    setState: async (...args) => calls.state.push(args),
    sleepImpl: async (...args) => {
      calls.sleeps = calls.sleeps || [];
      calls.sleeps.push(args);
    },
    throwIfStopped: () => {},
    ...overrides,
  });
  return { calls, executor };
}

(async () => {
  const mailboxUrl = 'https://example.test/mailbox?api_key=secret-key&email=a%40example.com';
  const successHarness = createHarness([createJsonResponse({ data: { code: '331258' } })]);
  await successHarness.executor.executeFetchExistingLoginCode({
    existingAccount: { mailboxUrl },
  });

  assert.deepStrictEqual(JSON.parse(JSON.stringify(successHarness.calls.fetches[0])), [
    mailboxUrl,
    { method: 'GET', cache: 'no-store' },
  ]);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(successHarness.calls.state[0])), [
    { lastLoginCode: '331258' },
  ]);
  assert.strictEqual(successHarness.calls.messages[0][0], 'signup-page');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(successHarness.calls.messages[0][1])), {
    type: 'EXECUTE_NODE',
    nodeId: 'fetch-existing-login-code',
    step: 3,
    payload: { code: '331258' },
  });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(successHarness.calls.messages[0][2])), {
    timeoutMs: 60000,
    responseTimeoutMs: 60000,
  });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(successHarness.calls.completed[0])), [
    'fetch-existing-login-code',
    { code: '331258' },
  ]);
  assert.ok(
    successHarness.calls.logs.some((args) => String(args[0]) === '正在通过 mailbox_url 获取登录验证码'),
    '应记录不含真实 URL 的获取日志。'
  );
  assert.ok(
    !JSON.stringify(successHarness.calls.logs).includes('secret-key'),
    '日志不应泄露 mailbox_url 中的 api_key。'
  );

  const httpHarness = createHarness([createJsonResponse({ error: '失败' }, 503, false)]);
  await assert.rejects(
    () => httpHarness.executor.executeFetchExistingLoginCode({
      existingAccount: { mailboxUrl: 'https://example.test/mailbox' },
    }),
    /验证码接口请求失败：HTTP 503/
  );
  assert.strictEqual(httpHarness.calls.messages.length, 0);
  assert.strictEqual(httpHarness.calls.completed.length, 0);

  const invalidJsonHarness = createHarness([{
    ok: true,
    status: 200,
    json: async () => {
      throw new Error('解析失败');
    },
  }]);
  await assert.rejects(
    () => invalidJsonHarness.executor.executeFetchExistingLoginCode({
      existingAccount: { mailboxUrl: 'https://example.test/mailbox' },
    }),
    /验证码接口返回的内容不是有效 JSON。/
  );
  assert.strictEqual(invalidJsonHarness.calls.messages.length, 0);
  assert.strictEqual(invalidJsonHarness.calls.completed.length, 0);

  const missingUrlHarness = createHarness([]);
  await assert.rejects(
    () => missingUrlHarness.executor.executeFetchExistingLoginCode({ existingAccount: {} }),
    /缺少 mailbox_url，请先保存账户 JSON。/
  );
  assert.strictEqual(missingUrlHarness.calls.fetches.length, 0);

  const contentErrorHarness = createHarness([createJsonResponse({ code: '123456' })], {
    sendToContentScriptResilient: async (...args) => {
      const [, message] = args;
      contentErrorHarness.calls.messages.push(args);
      assert.strictEqual(message.payload.code, '123456');
      return { error: '页面验证码提交失败' };
    },
  });
  await assert.rejects(
    () => contentErrorHarness.executor.executeFetchExistingLoginCode({
      existingAccount: { mailboxUrl: 'https://example.test/mailbox' },
    }),
    /页面验证码提交失败/
  );
  assert.deepStrictEqual(JSON.parse(JSON.stringify(contentErrorHarness.calls.state[0])), [
    { lastLoginCode: '123456' },
  ]);
  assert.strictEqual(contentErrorHarness.calls.completed.length, 0);

  const redirectedAfterSubmitHarness = createHarness([createJsonResponse({ code: '778899' })], {
    getTabId: async (source) => {
      assert.strictEqual(source, 'signup-page');
      return 24;
    },
    chrome: {
      tabs: {
        get: async (tabId) => {
          assert.strictEqual(tabId, 24);
          return { url: 'https://chatgpt.com/' };
        },
      },
    },
    sendToContentScriptResilient: async (...args) => {
      redirectedAfterSubmitHarness.calls.messages.push(args);
      throw new Error('内容脚本 60 秒内未响应');
    },
  });
  await redirectedAfterSubmitHarness.executor.executeFetchExistingLoginCode({
    existingAccount: { mailboxUrl: 'https://example.test/mailbox' },
  });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(redirectedAfterSubmitHarness.calls.completed[0])), [
    'fetch-existing-login-code',
    { code: '778899', assumed: true, url: 'https://chatgpt.com/' },
  ]);
  assert.ok(
    redirectedAfterSubmitHarness.calls.logs.some((args) => String(args[0]).includes('页面已跳转到 ChatGPT 已登录页')),
    '验证码提交后通信超时时，应按页面已登录态完成步骤。'
  );

  const retrySuccessHarness = createHarness([
    new Error(`网络失败 ${mailboxUrl}`),
    createJsonResponse({ code: '654321' }),
  ]);
  await retrySuccessHarness.executor.executeFetchExistingLoginCode({
    existingAccount: { mailboxUrl },
  });
  assert.strictEqual(retrySuccessHarness.calls.fetches.length, 2);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(retrySuccessHarness.calls.sleeps)), [
    [1000],
  ]);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(retrySuccessHarness.calls.completed[0])), [
    'fetch-existing-login-code',
    { code: '654321' },
  ]);

  const retryFailedHarness = createHarness([
    new Error(`第一次失败 ${mailboxUrl}`),
    new Error('第二次失败 api_key=secret-key'),
    new Error(`第三次失败 ${mailboxUrl}`),
  ]);
  await assert.rejects(
    () => retryFailedHarness.executor.executeFetchExistingLoginCode({
      existingAccount: { mailboxUrl },
    }),
    (error) => {
      assert.strictEqual(error.message, '验证码接口请求失败：网络请求异常。');
      assert.ok(!error.message.includes('api_key'), '网络错误不应泄露 api_key。');
      assert.ok(!error.message.includes(mailboxUrl), '网络错误不应泄露完整 mailbox_url。');
      return true;
    }
  );
  assert.strictEqual(retryFailedHarness.calls.fetches.length, 3);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(retryFailedHarness.calls.sleeps)), [
    [1000],
    [1000],
  ]);
  assert.strictEqual(retryFailedHarness.calls.completed.length, 0);

  let stoppedAfterContent = false;
  const stopBeforeCompleteHarness = createHarness([createJsonResponse({ code: '112233' })], {
    sendToContentScriptResilient: async (...args) => {
      stopBeforeCompleteHarness.calls.messages.push(args);
      stoppedAfterContent = true;
      return { success: true };
    },
    throwIfStopped: () => {
      if (stoppedAfterContent) {
        throw new Error('用户已停止');
      }
    },
  });
  await assert.rejects(
    () => stopBeforeCompleteHarness.executor.executeFetchExistingLoginCode({
      existingAccount: { mailboxUrl: 'https://example.test/mailbox' },
    }),
    /用户已停止/
  );
  assert.strictEqual(stopBeforeCompleteHarness.calls.completed.length, 0);

  console.log('已有账户登录验证码执行器测试通过');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
