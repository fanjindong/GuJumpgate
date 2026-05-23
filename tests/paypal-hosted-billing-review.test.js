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
        width: 160,
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

function createSandbox({ pathname, bodyText, controls }) {
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
      href: `https://www.paypal.com${pathname}?token=BA-test&redirectToHermes=true&fromSignupLite=true&fallback=1`,
      host: 'www.paypal.com',
      pathname,
      search: '?token=BA-test&redirectToHermes=true&fromSignupLite=true&fallback=1',
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
      querySelector(selector) {
        if (selector === 'button[data-testid="consentButton"]') {
          return controls.find((control) => control.getAttribute('data-testid') === 'consentButton') || null;
        }
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

const consentButton = createVisibleButton('Agree and Continue', {
  id: 'consentButton',
  'data-testid': 'consentButton',
});
const sandbox = createSandbox({
  pathname: '/pay/billing',
  bodyText: 'Review your billing agreement',
  controls: [consentButton],
});

(async () => {
  vm.runInNewContext(source, sandbox, { filename: paypalFlowPath });

  assert.strictEqual(
    sandbox.inspectPayPalState().hostedStage,
    'review_consent',
    '/pay/billing 上的 Agree and Continue 应识别为 hosted checkout 账单确认页。'
  );

  const result = await sandbox.clickHostedReviewConsent();
  assert.strictEqual(result.stage, 'review_consent', '/pay/billing 应沿用 hosted checkout 账单确认提交结果。');
  assert.strictEqual(consentButton.clicked, true, '/pay/billing 应点击 Agree and Continue。');

  console.log('PayPal hosted checkout billing 账单确认页识别测试通过');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
