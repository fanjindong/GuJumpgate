const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const modulePath = path.join(__dirname, '..', 'data', 'step-definitions.js');
const source = fs.readFileSync(modulePath, 'utf8');
const sandbox = { self: {}, globalThis: {} };
sandbox.globalThis = sandbox;
sandbox.self = sandbox;
vm.runInNewContext(source, sandbox, { filename: modulePath });

const definitions = sandbox.MultiPageStepDefinitions;
const legacyKeys = [
  'submit-signup-email',
  'fill-password',
  'confirm-oauth',
  'platform-verify',
];

const paypalKeys = [
  'open-chatgpt',
  'existing-account-login',
  'fetch-existing-login-code',
  'plus-checkout-create',
  'plus-checkout-billing',
  'paypal-approve',
  'plus-activation-success',
];

const hostedPaypalKeys = [
  'open-chatgpt',
  'existing-account-login',
  'fetch-existing-login-code',
  'plus-checkout-create',
  'hosted-checkout-submit',
  'hosted-paypal-payment',
  'plus-activation-success',
];

const gopayKeys = [
  'open-chatgpt',
  'existing-account-login',
  'fetch-existing-login-code',
  'plus-checkout-create',
  'gopay-subscription-confirm',
  'plus-activation-success',
];

const gpcKeys = [
  'open-chatgpt',
  'existing-account-login',
  'fetch-existing-login-code',
  'plus-checkout-create',
  'plus-checkout-billing',
  'plus-activation-success',
];

function getStepKeys(options) {
  return Array.from(definitions.getSteps(options), (step) => step.key);
}

assert.deepStrictEqual(getStepKeys({ plusModeEnabled: true }), hostedPaypalKeys);
assert.deepStrictEqual(getStepKeys({ plusModeEnabled: true, plusPaymentMethod: 'paypal' }), hostedPaypalKeys);
assert.deepStrictEqual(
  getStepKeys({ plusModeEnabled: true, plusPaymentMethod: 'paypal', plusHostedCheckoutIsFinalStep: false }),
  paypalKeys,
  '显式关闭 hosted checkout 终态等待时，才保留旧 PayPal 账单与授权节点。'
);
assert.deepStrictEqual(getStepKeys({ plusModeEnabled: true, plusPaymentMethod: 'gopay' }), gopayKeys);
assert.deepStrictEqual(getStepKeys({ plusModeEnabled: true, plusPaymentMethod: 'gpc-helper' }), gpcKeys);

const allSteps = Array.from(definitions.getAllSteps());
const allKeys = allSteps.map((step) => step.key);
for (const legacyKey of legacyKeys) {
  assert.ok(!allKeys.includes(legacyKey), `总步骤不应包含旧流程节点：${legacyKey}`);
}

const allBillingStep = allSteps.find((step) => step.key === 'plus-checkout-billing');
assert.strictEqual(allBillingStep?.title, '填写账单并提交订单');
assert.notStrictEqual(allBillingStep?.title, '等待 GPC 任务完成');

const allBillingNode = Array.from(definitions.getAllNodes()).find((node) => node.nodeId === 'plus-checkout-billing');
assert.strictEqual(allBillingNode?.title, '填写账单并提交订单');

const paypalWorkflow = definitions.getWorkflow({ plusPaymentMethod: 'paypal', plusModeEnabled: true });
assert.deepStrictEqual(Array.from(paypalWorkflow.nodeIds), hostedPaypalKeys);

const hostedPaypalNodes = definitions.getNodes({ plusPaymentMethod: 'paypal', plusModeEnabled: true });
const hostedPaypalPageIds = Object.fromEntries(hostedPaypalNodes.map((node) => [node.nodeId, node.ui?.pageId]));
assert.deepStrictEqual(hostedPaypalPageIds, {
  'open-chatgpt': 'chatgpt',
  'existing-account-login': 'auth',
  'fetch-existing-login-code': 'auth',
  'plus-checkout-create': 'checkout',
  'hosted-checkout-submit': 'checkout',
  'hosted-paypal-payment': 'paypal',
  'plus-activation-success': 'success',
});
for (const node of hostedPaypalNodes) {
  assert.ok(node.ui?.pageTitle, `节点 ${node.nodeId} 应包含页面标题。`);
}

const successNode = definitions.getNodeById('plus-activation-success', {
  plusPaymentMethod: 'paypal',
  plusModeEnabled: true,
});
assert.strictEqual(successNode?.title, 'Plus 开通成功');

console.log('已有账户流程定义测试通过');
