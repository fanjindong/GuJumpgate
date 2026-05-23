const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const rootDir = path.join(__dirname, '..');
const backgroundPath = path.join(rootDir, 'background.js');
const signupPagePath = path.join(rootDir, 'content', 'signup-page.js');
const executorPath = path.join(rootDir, 'background', 'steps', 'existing-account-login.js');

const backgroundSource = fs.readFileSync(backgroundPath, 'utf8');
const signupPageSource = fs.readFileSync(signupPagePath, 'utf8');

function extractObjectCreationBlock(source, marker) {
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `应存在 ${marker}。`);
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
  throw new Error(`无法提取 ${marker}。`);
}

assert.ok(
  backgroundSource.includes("'background/steps/existing-account-login.js'"),
  'background.js 应加载已有账户登录步骤脚本。'
);
assert.ok(
  backgroundSource.includes('MultiPageBackgroundExistingAccountLogin?.createExistingAccountLoginExecutor'),
  'background.js 应创建已有账户登录执行器。'
);
const executorCreationBlock = extractObjectCreationBlock(
  backgroundSource,
  'const existingAccountLoginExecutor = self.MultiPageBackgroundExistingAccountLogin?.createExistingAccountLoginExecutor'
);
for (const dependencyName of [
  'getErrorMessage',
  'getLoginAuthStateLabel',
  'isStep6RecoverableResult',
  'isStep6SuccessResult',
  'SIGNUP_PAGE_INJECT_FILES',
  'STEP6_MAX_ATTEMPTS',
]) {
  assert.ok(
    executorCreationBlock.includes(dependencyName),
    `background.js 创建已有账户登录执行器时应注入 ${dependencyName}。`
  );
}
assert.ok(
  signupPageSource.includes("'existing-account-login': (payload) => step6_login({ ...payload, loginIdentifierType: 'email', accountIdentifier: payload.email })"),
  'signup-page.js 应复用 step6_login 处理已有账户登录。'
);

const sandbox = { self: {}, globalThis: {}, Date };
sandbox.globalThis = sandbox;
sandbox.self = sandbox;
vm.runInNewContext(fs.readFileSync(executorPath, 'utf8'), sandbox, { filename: executorPath });

assert.ok(
  sandbox.MultiPageBackgroundExistingAccountLogin?.createExistingAccountLoginExecutor,
  '应导出 createExistingAccountLoginExecutor。'
);

function createHarness(results, overrides = {}) {
  const calls = {
    logs: [],
    tabs: [],
    messages: [],
    completed: [],
  };
  const queue = Array.from(results);
  const executor = sandbox.MultiPageBackgroundExistingAccountLogin.createExistingAccountLoginExecutor({
    addLog: async (...args) => calls.logs.push(args),
    completeNodeFromBackground: async (...args) => calls.completed.push(args),
    getOAuthFlowStepTimeoutMs: async () => 12345,
    reuseOrCreateTab: async (...args) => calls.tabs.push(args),
    sendToContentScriptResilient: async (...args) => {
      calls.messages.push(args);
      return queue.shift();
    },
    getErrorMessage: (error) => String(error?.message || error || '未知错误'),
    getLoginAuthStateLabel: (state) => `状态 ${state || '未知'}`,
    isStep6RecoverableResult: (result) => Boolean(result?.recoverable),
    isStep6SuccessResult: (result) => Boolean(result?.success),
    SIGNUP_PAGE_INJECT_FILES: ['content/utils.js', 'content/signup-page.js'],
    STEP6_MAX_ATTEMPTS: 2,
    throwIfStopped: () => {},
    ...overrides,
  });
  return { calls, executor };
}

(async () => {
  const successHarness = createHarness([{ success: true, loginVerificationRequestedAt: 98765 }]);
  const { calls, executor } = successHarness;
  await executor.executeExistingAccountLogin({
    existingAccount: {
      email: ' old@example.com ',
      password: 'secret',
    },
  });

  assert.deepStrictEqual(JSON.parse(JSON.stringify(calls.tabs[0])), [
    'signup-page',
    'https://chatgpt.com/auth/login',
    {
      forceNew: true,
      inject: ['content/utils.js', 'content/signup-page.js'],
      injectSource: 'signup-page',
    },
  ]);
  assert.strictEqual(calls.messages[0][0], 'signup-page');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(calls.messages[0][1])), {
    type: 'EXECUTE_NODE',
    nodeId: 'existing-account-login',
    step: 2,
    payload: {
      email: 'old@example.com',
      password: 'secret',
      accountIdentifier: 'old@example.com',
      loginIdentifierType: 'email',
      visibleStep: 2,
    },
  });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(calls.completed[0])), [
    'existing-account-login',
    { loginVerificationRequestedAt: 98765 },
  ]);

  const retryHarness = createHarness([
    { recoverable: true, state: 'email_page', message: '仍停留在邮箱页' },
    { success: true, loginVerificationRequestedAt: 22334 },
  ]);
  await retryHarness.executor.executeExistingAccountLogin({
    email: 'fallback@example.com',
    password: 'fallback-secret',
  });
  assert.strictEqual(retryHarness.calls.messages.length, 2);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(retryHarness.calls.completed[0])), [
    'existing-account-login',
    { loginVerificationRequestedAt: 22334 },
  ]);
  assert.ok(
    retryHarness.calls.logs.some((args) => String(args[0]).includes('第 1 次尝试失败，原因：仍停留在邮箱页；准备重试...')),
    '可恢复失败后应记录重试日志。'
  );

  const exhaustedHarness = createHarness([
    { recoverable: true, state: 'email_page', message: '仍停留在邮箱页' },
    { recoverable: true, state: 'password_page' },
  ]);
  await assert.rejects(
    () => exhaustedHarness.executor.executeExistingAccountLogin({
      existingAccount: { email: 'old@example.com', password: 'secret' },
    }),
    /步骤 2：判断失败后已重试 1 次，仍未成功。最后原因：当前停留在状态 password_page，准备重新执行步骤 2。/
  );
  assert.strictEqual(exhaustedHarness.calls.messages.length, 2);
  assert.strictEqual(exhaustedHarness.calls.completed.length, 0);

  const errorHarness = createHarness([{ error: '页面脚本失败 secret' }]);
  await assert.rejects(
    () => errorHarness.executor.executeExistingAccountLogin({
      existingAccount: { email: 'old@example.com', password: 'secret' },
    }),
    (error) => {
      assert.match(error.message, /页面脚本失败 \*\*\*/);
      assert.ok(!error.message.includes('secret'), '错误文案不应泄露密码。');
      return true;
    }
  );
  assert.strictEqual(errorHarness.calls.messages.length, 1);
  assert.strictEqual(errorHarness.calls.completed.length, 0);

  const unknownHarness = createHarness([{ state: 'unknown_page' }]);
  await assert.rejects(
    () => unknownHarness.executor.executeExistingAccountLogin({
      existingAccount: { email: 'old@example.com', password: 'secret' },
    }),
    /步骤 2：认证页未返回可识别的登录结果。/
  );
  assert.strictEqual(unknownHarness.calls.messages.length, 1);
  assert.strictEqual(unknownHarness.calls.completed.length, 0);

  await assert.rejects(
    () => executor.executeExistingAccountLogin({ existingAccount: { email: 'old@example.com' } }),
    /缺少已有账户邮箱或密码，请先保存账户 JSON。/
  );

  console.log('已有账户登录注册测试通过');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
