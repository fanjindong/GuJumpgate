const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const backgroundPath = path.join(__dirname, '..', 'background.js');
const source = fs.readFileSync(backgroundPath, 'utf8');

function extractFunctionSource(functionName) {
  const start = source.indexOf(`function ${functionName}`);
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

const sandbox = {
  getErrorMessage: (error) => String(error?.message || error || ''),
};

vm.runInNewContext(`
${extractFunctionSource('isPlusCheckoutNonFreeTrialFailure')}
${extractFunctionSource('isPlusCheckoutCloudConversionFailure')}
${extractFunctionSource('isPlusCheckoutRestartRequiredFailure')}
this.isPlusCheckoutCloudConversionFailure = isPlusCheckoutCloudConversionFailure;
this.isPlusCheckoutRestartRequiredFailure = isPlusCheckoutRestartRequiredFailure;
`, sandbox);

const cloudProxyDisconnectedError = new Error(
  '步骤 6：云端支付转换失败：代理连接被对端断开。请先点“检测代理”。'
);

assert.strictEqual(
  sandbox.isPlusCheckoutCloudConversionFailure(cloudProxyDisconnectedError),
  true,
  '云端支付转换失败应被单独识别。'
);
assert.strictEqual(
  sandbox.isPlusCheckoutRestartRequiredFailure(cloudProxyDisconnectedError),
  false,
  '云端支付转换失败不应触发 plus-checkout-create 自动重建。'
);
assert.strictEqual(
  sandbox.isPlusCheckoutRestartRequiredFailure(new Error('步骤 6：hosted checkout 页面长时间未跳转到 PayPal。')),
  true,
  '普通 checkout 卡住仍应允许自动重建。'
);

console.log('云端支付转换重试分类测试通过');
