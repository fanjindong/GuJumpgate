const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const rootDir = path.join(__dirname, '..');
const backgroundPath = path.join(rootDir, 'background.js');
const executorPath = path.join(rootDir, 'background', 'steps', 'plus-activation-success.js');

const backgroundSource = fs.readFileSync(backgroundPath, 'utf8');

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

assert.ok(
  fs.existsSync(executorPath),
  '应存在 plus-activation-success 后台执行器文件。'
);
assert.ok(
  backgroundSource.includes("'background/steps/plus-activation-success.js'"),
  'background.js 应加载 Plus 开通成功步骤脚本。'
);
assert.ok(
  backgroundSource.includes('MultiPageBackgroundPlusActivationSuccess?.createPlusActivationSuccessExecutor'),
  'background.js 应创建 Plus 开通成功执行器。'
);
assert.ok(
  backgroundSource.includes("'plus-activation-success': (state) => plusActivationSuccessExecutor.executePlusActivationSuccess(state)"),
  'background.js 应注册 plus-activation-success 步骤执行器。'
);

const failNodeSource = extractFunctionSource(backgroundSource, 'failNodeFromBackground');
for (const nodeId of [
  'plus-checkout-create',
  'plus-checkout-billing',
  'paypal-approve',
  'gopay-subscription-confirm',
  'plus-activation-success',
]) {
  assert.ok(
    backgroundSource.includes(nodeId),
    `background.js 应定义 ${nodeId} 为 Plus 开通失败节点。`
  );
}
assert.ok(
  failNodeSource.includes('PLUS_ACTIVATION_FAILURE_NODE_IDS.has(normalizedNodeId)'),
  'failNodeFromBackground 应使用 Plus 开通失败节点集合。'
);
assert.ok(
  failNodeSource.includes("plusActivationStatus: 'failed'"),
  'Plus 开通相关节点失败时应写入 plusActivationStatus。'
);
assert.ok(
  failNodeSource.includes('plusActivationMessage: message'),
  'Plus 开通相关节点失败时应写入失败消息。'
);
assert.ok(
  failNodeSource.indexOf("plusActivationStatus: 'failed'") < failNodeSource.indexOf('await setNodeStatus(normalizedNodeId, \'failed\')'),
  'Plus 开通失败状态更新不应替代原有 fail 逻辑。'
);

const sandbox = {
  self: {},
  globalThis: {},
  Date: {
    now: () => 1777777777777,
  },
};
sandbox.globalThis = sandbox;
sandbox.self = sandbox;
vm.runInNewContext(fs.readFileSync(executorPath, 'utf8'), sandbox, {
  filename: executorPath,
});

assert.ok(
  sandbox.MultiPageBackgroundPlusActivationSuccess?.createPlusActivationSuccessExecutor,
  '应导出 createPlusActivationSuccessExecutor。'
);

(async () => {
  const calls = {
    completed: [],
    logs: [],
    state: [],
  };
  const executor = sandbox.MultiPageBackgroundPlusActivationSuccess.createPlusActivationSuccessExecutor({
    addLog: async (...args) => calls.logs.push(args),
    completeNodeFromBackground: async (...args) => calls.completed.push(args),
    setState: async (...args) => calls.state.push(args),
  });

  await executor.executePlusActivationSuccess();

  const expectedPayload = {
    plusActivationStatus: 'success',
    plusActivatedAt: 1777777777777,
    plusActivationMessage: 'Plus 开通成功',
  };
  assert.deepStrictEqual(JSON.parse(JSON.stringify(calls.state[0])), [
    expectedPayload,
  ]);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(calls.logs[0])), [
    'Plus 开通成功',
    'ok',
    { nodeId: 'plus-activation-success' },
  ]);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(calls.completed[0])), [
    'plus-activation-success',
    expectedPayload,
  ]);

  console.log('Plus 开通成功节点测试通过');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
