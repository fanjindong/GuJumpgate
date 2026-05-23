const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const paypalFlowPath = path.join(__dirname, '..', 'content', 'paypal-flow.js');
const source = fs.readFileSync(paypalFlowPath, 'utf8');

function createVisibleButton(text, attrs = {}) {
  return {
    textContent: text,
    value: '',
    id: attrs.id || '',
    disabled: false,
    hidden: false,
    parentElement: null,
    getAttribute(name) {
      return attrs[name] || '';
    },
    getBoundingClientRect() {
      return {
        width: 180,
        height: 44,
        left: 0,
        top: 0,
      };
    },
    click() {
      this.clicked = true;
    },
  };
}

function createSandbox({ pathname, search, bodyText, controls }) {
  const attrs = {};
  const elementsById = new Map();
  controls.forEach((control) => {
    if (control.id) {
      elementsById.set(control.id, control);
    }
  });

  return {
    console: {
      log() {},
      warn() {},
      error() {},
    },
    log() {},
    throwIfStopped() {},
    async sleep() {},
    location: {
      href: `https://www.paypal.com${pathname}${search}`,
      host: 'www.paypal.com',
      pathname,
      search,
    },
    URLSearchParams,
    window: {
      getComputedStyle() {
        return {
          display: 'block',
          visibility: 'visible',
          opacity: '1',
        };
      },
    },
    document: {
      readyState: 'complete',
      body: {
        innerText: bodyText || '',
      },
      documentElement: {
        getAttribute(name) {
          return attrs[name] || '';
        },
        setAttribute(name, value) {
          attrs[name] = value;
        },
      },
      getElementById(id) {
        return elementsById.get(id) || null;
      },
      querySelector() {
        return null;
      },
      querySelectorAll() {
        return controls;
      },
    },
    chrome: {
      runtime: {
        onMessage: {
          addListener() {},
        },
      },
    },
    setTimeout() {},
    MutationObserver: function MutationObserver() {
      return {
        observe() {},
        disconnect() {},
      };
    },
  };
}

const buyerRestrictionSearch = '?ssrt=1779443255031&token=BA-80M90513AL668335W&ul=1&errorCode=QlVZRVJfUkVTVFJJQ1RJT04%3D';

(async () => {
  const checkAccountButton = createVisibleButton('Check your Account');
  const genericErrorSandbox = createSandbox({
    pathname: '/pay/generic-error',
    search: buyerRestrictionSearch,
    bodyText: 'Something went wrong Check your Account',
    controls: [checkAccountButton],
  });

  vm.runInNewContext(source, genericErrorSandbox, { filename: paypalFlowPath });

  assert.strictEqual(
    genericErrorSandbox.inspectPayPalState().hostedStage,
    'generic_error',
    'PayPal generic-error 应识别为需要进入账号检查页的状态。'
  );

  const genericErrorResult = await genericErrorSandbox.runHostedCheckoutStep();
  assert.strictEqual(genericErrorResult.stage, 'generic_error', 'generic-error 应返回对应阶段。');
  assert.strictEqual(genericErrorResult.submitted, true, 'generic-error 应点击 Check your Account。');
  assert.strictEqual(checkAccountButton.clicked, true, 'generic-error 应点击 Check your Account 按钮。');

  const logoutButton = createVisibleButton('Log out');
  const logoutSandbox = createSandbox({
    pathname: '/',
    search: buyerRestrictionSearch,
    bodyText: 'Welcome Log out',
    controls: [logoutButton],
  });

  vm.runInNewContext(source, logoutSandbox, { filename: paypalFlowPath });

  assert.strictEqual(
    logoutSandbox.inspectPayPalState().hostedStage,
    'account_logout',
    '带 hosted checkout 错误参数的 PayPal 首页应识别为退出账号状态。'
  );

  const logoutResult = await logoutSandbox.runHostedCheckoutStep();
  assert.strictEqual(logoutResult.stage, 'account_logout', '退出页应返回对应阶段。');
  assert.strictEqual(logoutResult.submitted, true, '退出页应点击 Log out。');
  assert.strictEqual(logoutButton.clicked, true, '退出页应点击 Log out 按钮。');

  console.log('PayPal hosted checkout generic-error 自动退出测试通过');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
