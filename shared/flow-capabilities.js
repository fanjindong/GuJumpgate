(function attachMultiPageFlowCapabilities(root, factory) {
  root.MultiPageFlowCapabilities = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createFlowCapabilitiesModule() {
  const DEFAULT_FLOW_ID = 'openai';
  const DEFAULT_PANEL_MODE = 'local-cpa-json';
  const SIGNUP_METHOD_EMAIL = 'email';
  const PLUS_ACCOUNT_ACCESS_STRATEGY_OAUTH = 'oauth';

  const DEFAULT_FLOW_CAPABILITIES = Object.freeze({
    supportsEmailSignup: false,
    supportsPhoneSignup: false,
    supportsPhoneVerificationSettings: false,
    supportsPlusMode: true,
    supportsContributionMode: false,
    supportsPlatformBinding: Object.freeze([DEFAULT_PANEL_MODE]),
    supportsLuckmail: false,
    supportsOauthTimeoutBudget: false,
    canSwitchFlow: false,
    stepDefinitionMode: 'openai-existing-account-plus',
  });

  const FLOW_CAPABILITIES = Object.freeze({
    openai: Object.freeze({ ...DEFAULT_FLOW_CAPABILITIES }),
  });

  const DEFAULT_PANEL_CAPABILITIES = Object.freeze({
    supportsPhoneSignup: false,
    requiresPhoneSignupWarning: false,
    supportedPlusAccountAccessStrategies: Object.freeze([PLUS_ACCOUNT_ACCESS_STRATEGY_OAUTH]),
  });

  const PANEL_CAPABILITIES = Object.freeze({
    [DEFAULT_PANEL_MODE]: Object.freeze({ ...DEFAULT_PANEL_CAPABILITIES }),
  });

  function normalizeFlowId(value = '', fallback = DEFAULT_FLOW_ID) {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized && Object.prototype.hasOwnProperty.call(FLOW_CAPABILITIES, normalized)) {
      return normalized;
    }
    const fallbackValue = String(fallback || '').trim().toLowerCase();
    return Object.prototype.hasOwnProperty.call(FLOW_CAPABILITIES, fallbackValue)
      ? fallbackValue
      : DEFAULT_FLOW_ID;
  }

  function normalizePanelMode() {
    return DEFAULT_PANEL_MODE;
  }

  function normalizeSignupMethod() {
    return SIGNUP_METHOD_EMAIL;
  }

  function normalizePlusAccountAccessStrategy() {
    return PLUS_ACCOUNT_ACCESS_STRATEGY_OAUTH;
  }

  function normalizePlusPaymentMethod(value = '') {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'gpc-helper') {
      return 'gpc-helper';
    }
    return normalized === 'gopay' ? 'gopay' : 'paypal';
  }

  function hasHostedSmsPoolCandidate(text = '') {
    const lines = String(text || '')
      .replace(/\r/g, '')
      .split('\n')
      .map((line) => String(line || '').trim())
      .filter(Boolean);

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const separatorIndex = line.indexOf('----');
      const phone = separatorIndex > 0 ? line.slice(0, separatorIndex).trim() : line;
      const verificationUrl = separatorIndex > 0 ? line.slice(separatorIndex + 4).trim() : lines[index + 1];
      // 后台兜底校验必须和侧栏一致，避免定时启动绕过必填项后在 PayPal 阶段才失败。
      if (phone && verificationUrl) {
        return true;
      }
    }
    return false;
  }

  function createFlowCapabilityRegistry(deps = {}) {
    const defaultFlowId = deps.defaultFlowId || DEFAULT_FLOW_ID;

    function getFlowCapabilities(flowId) {
      const normalizedFlowId = normalizeFlowId(flowId, defaultFlowId);
      return {
        ...DEFAULT_FLOW_CAPABILITIES,
        ...(FLOW_CAPABILITIES[normalizedFlowId] || {}),
      };
    }

    function getPanelCapabilities() {
      return { ...DEFAULT_PANEL_CAPABILITIES };
    }

    function resolveSidepanelCapabilities(options = {}) {
      const state = options?.state || {};
      const activeFlowId = normalizeFlowId(options?.activeFlowId ?? state?.activeFlowId, defaultFlowId);
      const flowCapabilities = getFlowCapabilities(activeFlowId);
      const runtimeLocks = {
        autoRunLocked: Boolean(options?.autoRunLocked ?? state?.autoRunLocked),
        contributionMode: false,
        phoneVerificationEnabled: false,
        plusModeEnabled: true,
        settingsMenuLocked: Boolean(options?.settingsMenuLocked ?? state?.settingsMenuLocked),
      };

      return {
        activeFlowId,
        canShowContributionMode: false,
        canShowLuckmail: false,
        canShowPhoneSettings: false,
        canShowPlusSettings: true,
        canSwitchFlow: false,
        canEditPlusAccountAccessStrategy: false,
        canUsePhoneSignup: false,
        canUseSelectedPanelMode: true,
        effectivePlusAccountAccessStrategy: PLUS_ACCOUNT_ACCESS_STRATEGY_OAUTH,
        effectivePanelMode: DEFAULT_PANEL_MODE,
        effectiveSignupMethod: SIGNUP_METHOD_EMAIL,
        effectiveSignupMethods: [SIGNUP_METHOD_EMAIL],
        flowCapabilities,
        panelCapabilities: getPanelCapabilities(DEFAULT_PANEL_MODE),
        panelMode: DEFAULT_PANEL_MODE,
        requestedPanelMode: DEFAULT_PANEL_MODE,
        requestedPlusAccountAccessStrategy: PLUS_ACCOUNT_ACCESS_STRATEGY_OAUTH,
        requestedSignupMethod: SIGNUP_METHOD_EMAIL,
        runtimeLocks,
        shouldWarnCpaPhoneSignup: false,
        stepDefinitionOptions: {
          activeFlowId,
          panelMode: DEFAULT_PANEL_MODE,
          plusAccountAccessStrategy: PLUS_ACCOUNT_ACCESS_STRATEGY_OAUTH,
          plusModeEnabled: true,
          signupMethod: SIGNUP_METHOD_EMAIL,
        },
        availablePlusAccountAccessStrategies: [PLUS_ACCOUNT_ACCESS_STRATEGY_OAUTH],
        supportedPanelModes: [DEFAULT_PANEL_MODE],
      };
    }

    function validateAutoRunStart(options = {}) {
      const state = options?.state || {};
      const paymentMethod = normalizePlusPaymentMethod(state?.plusPaymentMethod);
      const verificationUrl = String(state?.hostedCheckoutVerificationUrl || '').trim();
      const phoneNumber = String(state?.hostedCheckoutPhoneNumber || '').trim();
      const hasSmsPool = hasHostedSmsPoolCandidate(state?.hostedCheckoutSmsPoolText);
      if (paymentMethod === 'paypal' && !((verificationUrl && phoneNumber) || hasSmsPool)) {
        return {
          ok: false,
          errors: [{
            code: 'missing_paypal_hosted_checkout_contact',
            message: 'PayPal Hosted Checkout 启动前请填写“验证码接口 + PayPal 电话(不带+1)”，或导入“Hosted 接码池”。',
          }],
          capabilityState: resolveSidepanelCapabilities(options),
        };
      }

      return {
        ok: true,
        errors: [],
        capabilityState: resolveSidepanelCapabilities(options),
      };
    }

    function validateModeSwitch(options = {}) {
      return {
        ok: true,
        changedKeys: Array.isArray(options?.changedKeys) ? [...options.changedKeys] : [],
        capabilityState: resolveSidepanelCapabilities(options),
        errors: [],
        normalizedUpdates: {
          plusModeEnabled: true,
          signupMethod: SIGNUP_METHOD_EMAIL,
          plusAccountAccessStrategy: PLUS_ACCOUNT_ACCESS_STRATEGY_OAUTH,
          panelMode: DEFAULT_PANEL_MODE,
          phoneVerificationEnabled: false,
          contributionMode: false,
        },
      };
    }

    return {
      canUsePhoneSignup: () => false,
      getFlowCapabilities,
      getPanelCapabilities,
      normalizeFlowId,
      normalizePanelMode,
      normalizeSignupMethod,
      resolveSidepanelCapabilities,
      resolveSignupMethod: () => SIGNUP_METHOD_EMAIL,
      validateAutoRunStart,
      validateModeSwitch,
    };
  }

  return {
    createFlowCapabilityRegistry,
    DEFAULT_FLOW_CAPABILITIES,
    DEFAULT_FLOW_ID,
    DEFAULT_PANEL_CAPABILITIES,
    DEFAULT_PANEL_MODE,
    FLOW_CAPABILITIES,
    PANEL_CAPABILITIES,
    PLUS_ACCOUNT_ACCESS_STRATEGY_OAUTH,
    SIGNUP_METHOD_EMAIL,
    normalizeFlowId,
    normalizePanelMode,
    normalizePlusAccountAccessStrategy,
    normalizeSignupMethod,
  };
});
