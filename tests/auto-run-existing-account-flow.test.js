const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const backgroundPath = path.join(__dirname, '..', 'background.js');
const autoRunControllerPath = path.join(__dirname, '..', 'background', 'auto-run-controller.js');
const capabilitiesPath = path.join(__dirname, '..', 'shared', 'flow-capabilities.js');
const signupPagePath = path.join(__dirname, '..', 'content', 'signup-page.js');
const legacyStepFiles = [
  'submit-signup-email.js',
  'fill-password.js',
  'fetch-signup-code.js',
  'fill-profile.js',
  'wait-registration-success.js',
  'oauth-login.js',
  'fetch-login-code.js',
  'confirm-oauth.js',
  'platform-verify.js',
];

function extractBlock(source, marker) {
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `应存在代码块：${marker}`);
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
  throw new Error(`无法提取代码块：${marker}`);
}

const backgroundSource = fs.readFileSync(backgroundPath, 'utf8');
const autoRunControllerSource = fs.readFileSync(autoRunControllerPath, 'utf8');
const signupPageSource = fs.readFileSync(signupPagePath, 'utf8');
const stepExecutorsSource = extractBlock(backgroundSource, 'const stepExecutorsByKey =');
const autoRunGraphSource = extractBlock(backgroundSource, 'async function runAutoSequenceFromNodeGraph');
const signupPageHandlersSource = extractBlock(signupPageSource, 'const SIGNUP_PAGE_NODE_HANDLERS =');

const legacyExecutorKeys = [
  'submit-signup-email',
  'fill-password',
  'fetch-signup-code',
  'fill-profile',
  'wait-registration-success',
  'oauth-login',
  'fetch-login-code',
  'confirm-oauth',
  'platform-verify',
];

for (const key of legacyExecutorKeys) {
  assert.ok(!stepExecutorsSource.includes(`'${key}'`), `后台执行器注册表不应包含旧节点：${key}`);
  assert.ok(!signupPageHandlersSource.includes(`'${key}'`), `内容脚本节点处理器不应包含旧节点：${key}`);
}

for (const fileName of legacyStepFiles) {
  assert.ok(
    !fs.existsSync(path.join(__dirname, '..', 'background', 'steps', fileName)),
    `旧后台步骤文件应删除：${fileName}`
  );
}

for (const key of [
  'existing-account-login',
  'fetch-existing-login-code',
  'hosted-checkout-submit',
  'hosted-paypal-payment',
  'plus-activation-success',
]) {
  assert.ok(stepExecutorsSource.includes(`'${key}'`), `后台执行器注册表应包含已有账户节点：${key}`);
}

assert.ok(!autoRunGraphSource.includes('ensureAutoEmailReady'), '后台自动运行主循环不应再包含注册邮箱预取逻辑。');
assert.ok(!autoRunGraphSource.includes("executeNodeAndWait('submit-signup-email'"), '自动运行不应特殊执行注册邮箱节点。');
assert.ok(!autoRunGraphSource.includes("executeNodeAndWaitWithAutoRunIdleLogWatchdog('fill-password'"), '自动运行不应特殊执行注册密码节点。');
assert.ok(!autoRunGraphSource.includes('firstVerificationIndex'), '自动运行不应从注册验证码节点截断 workflow。');
assert.ok(
  !autoRunControllerSource.includes('ensureHotmailMailboxReadyForAutoRunRound'),
  '已有账户流程不应在自动运行轮次开始前准备旧 Hotmail 账号池。'
);
const autoRunKeepSettingsSource = extractBlock(autoRunControllerSource, 'const keepSettings =');
for (const preservedKey of [
  'existingAccountJson',
  'existingAccount',
  'email',
  'password',
  'accountIdentifierType',
  'accountIdentifier',
]) {
  assert.ok(
    autoRunKeepSettingsSource.includes(`${preservedKey}: prevState.${preservedKey}`),
    `自动运行重置每轮状态时应保留已有账户字段：${preservedKey}`
  );
}

const capabilitiesSource = fs.readFileSync(capabilitiesPath, 'utf8');
const sandbox = { self: {}, globalThis: {} };
sandbox.globalThis = sandbox;
sandbox.self = sandbox;
vm.runInNewContext(capabilitiesSource, sandbox, { filename: capabilitiesPath });

const registry = sandbox.MultiPageFlowCapabilities.createFlowCapabilityRegistry();
const capabilityState = registry.resolveSidepanelCapabilities({
  panelMode: 'local-cpa-json',
  state: {
    panelMode: 'local-cpa-json',
    plusModeEnabled: true,
    signupMethod: 'email',
  },
});

assert.strictEqual(capabilityState.runtimeLocks.plusModeEnabled, true);
assert.strictEqual(capabilityState.runtimeLocks.phoneVerificationEnabled, false);
assert.strictEqual(capabilityState.effectiveSignupMethod, 'email');
assert.strictEqual(capabilityState.canUsePhoneSignup, false);
assert.deepStrictEqual(JSON.parse(JSON.stringify(capabilityState.supportedPanelModes)), ['local-cpa-json']);
assert.strictEqual(capabilityState.effectivePanelMode, 'local-cpa-json');
assert.deepStrictEqual(JSON.parse(JSON.stringify(capabilityState.availablePlusAccountAccessStrategies)), ['oauth']);
assert.strictEqual(capabilityState.canEditPlusAccountAccessStrategy, false);
assert.strictEqual(capabilityState.stepDefinitionOptions.plusModeEnabled, true);
assert.strictEqual(capabilityState.stepDefinitionOptions.signupMethod, 'email');

const modeValidation = registry.validateModeSwitch({
  state: {
    plusModeEnabled: true,
    signupMethod: 'email',
  },
  changedKeys: ['plusModeEnabled', 'signupMethod'],
});
assert.strictEqual(modeValidation.normalizedUpdates.plusModeEnabled, true);
assert.strictEqual(modeValidation.normalizedUpdates.signupMethod, 'email');
assert.strictEqual(registry.resolveSignupMethod({ signupMethod: 'email' }), 'email');
assert.strictEqual(registry.canUsePhoneSignup({ signupMethod: 'email' }), false);

const startValidation = registry.validateAutoRunStart({
  state: {
    plusModeEnabled: true,
    signupMethod: 'email',
  },
});
assert.strictEqual(startValidation.ok, true);
assert.strictEqual(startValidation.capabilityState.stepDefinitionOptions.plusModeEnabled, true);
assert.strictEqual(startValidation.capabilityState.stepDefinitionOptions.signupMethod, 'email');

console.log('自动运行已有账户 Plus 流程测试通过');
