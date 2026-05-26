const assert = require('assert');
const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const htmlPath = path.join(rootDir, 'sidepanel', 'sidepanel.html');
const jsPath = path.join(rootDir, 'sidepanel', 'sidepanel.js');
const cssPath = path.join(rootDir, 'sidepanel', 'sidepanel.css');

const html = fs.readFileSync(htmlPath, 'utf8');
const js = fs.readFileSync(jsPath, 'utf8');
const css = fs.readFileSync(cssPath, 'utf8');

function assertIncludes(source, needle, message) {
  assert.ok(source.includes(needle), message);
}

function assertNotIncludes(source, needle, message) {
  assert.ok(!source.includes(needle), message);
}

function extractFunctionSource(source, functionName) {
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

const htmlIds = new Set(Array.from(html.matchAll(/id="([^"]+)"/g)).map((match) => match[1]));
const sidepanelElementIds = Array.from(new Set(
  [
    ...Array.from(js.matchAll(/getElementById\('([^']+)'\)/g)).map((match) => match[1]),
    ...Array.from(js.matchAll(/byId\('([^']+)'\)/g)).map((match) => match[1]),
  ]
)).sort();

assertIncludes(html, 'id="row-existing-account-json"', '侧栏应包含账户 JSON 行。');
assertIncludes(html, 'id="input-existing-account-json"', '侧栏应包含账户 JSON 输入框。');
assertIncludes(html, 'id="row-plus-checkout-cloud-conversion"', '侧栏应显示云端支付转换开关。');
assertIncludes(html, 'id="page-recovery-card"', '侧栏应包含页面级恢复建议容器。');
assertIncludes(html, 'id="row-step6-cookie-cleanup-settings"', '侧栏应保留清 Cookies 独立开关行。');
assertIncludes(html, 'id="btn-save-settings"', '侧栏应保留保存按钮。');
assert.ok(css.length > 0, '侧栏样式文件应存在内容。');

const missingSidepanelElementIds = sidepanelElementIds.filter((id) => !htmlIds.has(id));
assert.deepStrictEqual(
  missingSidepanelElementIds,
  [],
  `侧栏脚本不应继续读取已删除 DOM：${missingSidepanelElementIds.join(', ')}`
);

for (const removedHtmlNeedle of [
  'id="select-flow"',
  'id="select-panel-mode"',
  'id="row-account-access-strategy"',
  'id="row-vps-url"',
  'id="row-vps-password"',
  'id="row-sub2api-url"',
  'id="row-codex2api-url"',
  'id="row-custom-password"',
  'id="row-mail-provider"',
  'id="row-email-generator"',
  'id="row-email-prefix"',
  'id="cloudflare-temp-email-section"',
  'id="cloud-mail-section"',
  'id="hotmail-section"',
  'id="mail2925-section"',
  'id="luckmail-section"',
  'id="icloud-section"',
  'id="phone-verification-section"',
  'id="ip-proxy-section"',
]) {
  assertNotIncludes(html, removedHtmlNeedle, `侧栏不应继续保留旧入口：${removedHtmlNeedle}`);
}

for (const removedScript of [
  'managed-alias-utils.js',
  'mail2925-utils.js',
  'hotmail-utils.js',
  'luckmail-utils.js',
  'mail-provider-utils.js',
  'ip-proxy-panel.js',
  'hotmail-manager.js',
  'mail-2925-manager.js',
  'icloud-manager.js',
  'luckmail-manager.js',
  'custom-email-pool-manager.js',
  'hosted-sms-pool-manager.js',
]) {
  assertNotIncludes(html, removedScript, `精简侧栏不应再加载旧模块脚本：${removedScript}`);
}

const collectSettingsPayloadSource = extractFunctionSource(js, 'collectSettingsPayload');
for (const requiredPayloadNeedle of [
  "activeFlowId: 'openai'",
  "panelMode: 'local-cpa-json'",
  'existingAccountJson: getExistingAccountJsonInputValue()',
  'plusPaymentMethod: getSelectedPaymentMethod()',
  'plusCheckoutCloudConversionEnabled:',
  'hostedCheckoutVerificationUrl:',
  'gopayHelperApiKey:',
  'gopayPin:',
  'autoRunSkipFailures:',
  'step6CookieCleanupEnabled:',
]) {
  assertIncludes(
    collectSettingsPayloadSource,
    requiredPayloadNeedle,
    `保存 payload 应包含当前侧栏字段：${requiredPayloadNeedle}`
  );
}

assertIncludes(
  html,
  'value="5" min="0" max="60" step="1"',
  '侧栏验证码弹窗延迟输入框默认值应为 5 秒。'
);
assertIncludes(
  html,
  '检测到验证码弹窗后，先等待多少秒再开始获取验证码；默认 5 秒',
  '侧栏验证码弹窗延迟说明应标明默认 5 秒。'
);
assertIncludes(
  collectSettingsPayloadSource,
  'hostedCheckoutVerificationPopupDelaySeconds: normalizePositiveInteger(elements.inputHostedCheckoutVerificationPopupDelaySeconds?.value, 5, { min: 0, max: 60 })',
  '侧栏保存验证码弹窗延迟时应使用 5 秒作为兜底默认值。'
);
assertIncludes(
  js,
  'elements.inputHostedCheckoutVerificationPopupDelaySeconds.value = String(normalizePositiveInteger(state.hostedCheckoutVerificationPopupDelaySeconds, 5, { min: 0, max: 60 }))',
  '侧栏回填验证码弹窗延迟时应使用 5 秒作为兜底默认值。'
);

for (const removedPayloadNeedle of [
  'inputVpsUrl',
  'inputSub2ApiUrl',
  'inputCodex2ApiUrl',
  'selectMailProvider',
  'inputEmailPrefix',
  'inputLuckmailApiKey',
  'inputTempEmailBaseUrl',
  'inputIpProxyHost',
]) {
  assertNotIncludes(
    collectSettingsPayloadSource,
    removedPayloadNeedle,
    `保存 payload 不应再依赖已删除字段：${removedPayloadNeedle}`
  );
}

const startAutoRunSource = extractFunctionSource(js, 'startAutoRunFromCurrentSettings');
assertIncludes(startAutoRunSource, 'ensureExistingAccountJsonReadyForStart();', '自动运行前必须校验账户 JSON。');
assertIncludes(startAutoRunSource, "type: 'AUTO_RUN'", '自动运行应发送 AUTO_RUN 消息。');
assertIncludes(startAutoRunSource, 'existingAccountJson: getExistingAccountJsonInputValue()', '自动运行应携带账户 JSON。');

const initAccountRecordsManagerSource = extractFunctionSource(js, 'initAccountRecordsManager');
assertIncludes(
  initAccountRecordsManagerSource,
  'getLatestState: () => latestState',
  '账号记录管理器依赖 getLatestState，精简侧栏必须提供该接口。'
);

const manualStepBlock = js.slice(js.indexOf("stepsList?.addEventListener('click'"));
assertIncludes(manualStepBlock, "type: 'EXECUTE_NODE'", '手动执行节点应发送 EXECUTE_NODE 消息。');
assertIncludes(manualStepBlock, 'existingAccountJson: getExistingAccountJsonInputValue()', '手动执行节点应携带账户 JSON。');
assertIncludes(js, "type: 'GET_PAGE_RECOVERY_STATE'", '侧栏应读取页面级恢复状态。');
assertIncludes(js, "type: 'RESUME_FROM_PAGE'", '侧栏应通过后台执行页面恢复动作。');
assertIncludes(js, "button.dataset.recoveryAction === 'refresh'", '重新检测按钮只应刷新建议，不能隐式执行恢复。');
assertIncludes(js, "data-recovery-action=\"${escapeHtml(suggestion.secondaryAction === 'refresh' ? 'refresh' : 'resume')}\"", '恢复建议次按钮应显式区分刷新和执行。');
assertIncludes(js, 'renderNodeRowsForPage(page)', '侧栏主流程应渲染页面，并把节点放入展开区域。');
assertIncludes(js, 'step-page', '侧栏主步骤应使用页面行样式。');

for (const removedJsNeedle of [
  'updateMailProviderUI',
  'rowEmailPrefix',
  'selectMailProvider',
  'inputEmailPrefix',
  'updateIpProxyUI',
  'updatePhoneVerificationSettingsUI',
  'renderHotmailAccounts',
  'renderMail2925Accounts',
  'renderLuckmailPurchases',
]) {
  assertNotIncludes(js, removedJsNeedle, `精简侧栏脚本不应保留旧模块引用：${removedJsNeedle}`);
}

console.log('侧栏已有账户 UI 静态测试通过');
