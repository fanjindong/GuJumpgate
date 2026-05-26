(function attachStepDefinitions(root, factory) {
  root.MultiPageStepDefinitions = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createStepDefinitionsModule() {
  const DEFAULT_ACTIVE_FLOW_ID = 'openai';
  const PLUS_PAYMENT_METHOD_PAYPAL = 'paypal';
  const PLUS_PAYMENT_METHOD_GOPAY = 'gopay';
  const PLUS_PAYMENT_METHOD_GPC_HELPER = 'gpc-helper';
  const PLUS_PAYMENT_STEP_KEY = 'paypal-approve';
  const PLUS_ACCOUNT_ACCESS_STRATEGY_OAUTH = 'oauth';
  const OPENAI_PAGE_GROUPS = Object.freeze({
    chatgpt: Object.freeze({ pageId: 'chatgpt', pageTitle: 'ChatGPT 页面' }),
    auth: Object.freeze({ pageId: 'auth', pageTitle: '认证页' }),
    checkout: Object.freeze({ pageId: 'checkout', pageTitle: 'Checkout 页面' }),
    paypal: Object.freeze({ pageId: 'paypal', pageTitle: 'PayPal 页面' }),
    success: Object.freeze({ pageId: 'success', pageTitle: '开通结果' }),
  });

  function withPage(step, pageId) {
    const page = OPENAI_PAGE_GROUPS[pageId] || null;
    return {
      ...step,
      // 页面分组只服务于侧栏展示与恢复判断，不改变 workflow 的真实执行顺序。
      ui: {
        ...(step.ui && typeof step.ui === 'object' ? step.ui : {}),
        ...(page || {}),
      },
    };
  }

  const EXISTING_ACCOUNT_COMMON_PREFIX_STEP_DEFINITIONS = [
    withPage({ id: 1, order: 10, key: 'open-chatgpt', title: '打开 ChatGPT 官网', sourceId: 'chatgpt', driverId: null, command: 'open-chatgpt' }, 'chatgpt'),
    withPage({ id: 2, order: 20, key: 'existing-account-login', title: '登录已有账户', sourceId: 'openai-auth', driverId: 'content/signup-page', command: 'existing-account-login' }, 'auth'),
    withPage({ id: 3, order: 30, key: 'fetch-existing-login-code', title: '获取登录验证码', sourceId: 'openai-auth', driverId: 'content/signup-page', command: 'fetch-existing-login-code', mailRuleId: 'openai-login-code' }, 'auth'),
    withPage({ id: 4, order: 40, key: 'plus-checkout-create', title: '创建 Plus Checkout', sourceId: 'plus-checkout', driverId: 'content/plus-checkout', command: 'plus-checkout-create' }, 'checkout'),
  ];

  const EXISTING_ACCOUNT_PAYPAL_STEP_DEFINITIONS = [
    ...EXISTING_ACCOUNT_COMMON_PREFIX_STEP_DEFINITIONS,
    withPage({ id: 5, order: 50, key: 'plus-checkout-billing', title: '填写账单并提交订单', sourceId: 'plus-checkout', driverId: 'content/plus-checkout', command: 'plus-checkout-billing' }, 'checkout'),
    withPage({ id: 6, order: 60, key: 'paypal-approve', title: 'PayPal 登录与授权', sourceId: 'paypal-flow', driverId: 'content/paypal-flow', command: 'paypal-approve' }, 'paypal'),
    withPage({ id: 7, order: 70, key: 'plus-activation-success', title: 'Plus 开通成功', sourceId: 'chatgpt', driverId: null, command: 'plus-activation-success' }, 'success'),
  ];

  const EXISTING_ACCOUNT_PAYPAL_HOSTED_CHECKOUT_STEP_DEFINITIONS = [
    ...EXISTING_ACCOUNT_COMMON_PREFIX_STEP_DEFINITIONS,
    withPage({ id: 5, order: 50, key: 'hosted-checkout-submit', title: '填写 Hosted Checkout', sourceId: 'plus-checkout', driverId: 'content/plus-checkout', command: 'hosted-checkout-submit' }, 'checkout'),
    withPage({ id: 6, order: 60, key: 'hosted-paypal-payment', title: '处理 PayPal Hosted 支付', sourceId: 'paypal-flow', driverId: 'content/paypal-flow', command: 'hosted-paypal-payment' }, 'paypal'),
    withPage({
      id: 7,
      order: 70,
      key: 'plus-activation-success',
      title: 'Plus 开通成功',
      sourceId: 'chatgpt',
      driverId: null,
      command: 'plus-activation-success',
    }, 'success'),
  ];

  const EXISTING_ACCOUNT_GOPAY_STEP_DEFINITIONS = [
    ...EXISTING_ACCOUNT_COMMON_PREFIX_STEP_DEFINITIONS,
    withPage({ id: 5, order: 50, key: 'gopay-subscription-confirm', title: '等待 GoPay 订阅确认', sourceId: 'gopay-flow', driverId: 'content/gopay-flow', command: 'gopay-subscription-confirm' }, 'paypal'),
    withPage({ id: 6, order: 60, key: 'plus-activation-success', title: 'Plus 开通成功', sourceId: 'chatgpt', driverId: null, command: 'plus-activation-success' }, 'success'),
  ];

  const EXISTING_ACCOUNT_GPC_STEP_DEFINITIONS = [
    ...EXISTING_ACCOUNT_COMMON_PREFIX_STEP_DEFINITIONS,
    withPage({ id: 5, order: 50, key: 'plus-checkout-billing', title: '等待 GPC 任务完成', sourceId: 'plus-checkout', driverId: 'content/plus-checkout', command: 'plus-checkout-billing' }, 'checkout'),
    withPage({ id: 6, order: 60, key: 'plus-activation-success', title: 'Plus 开通成功', sourceId: 'chatgpt', driverId: null, command: 'plus-activation-success' }, 'success'),
  ];

  const PLUS_PAYPAL_STEP_DEFINITIONS = EXISTING_ACCOUNT_PAYPAL_STEP_DEFINITIONS;
  const PLUS_PAYPAL_HOSTED_CHECKOUT_STEP_DEFINITIONS = EXISTING_ACCOUNT_PAYPAL_HOSTED_CHECKOUT_STEP_DEFINITIONS;
  const PLUS_GOPAY_STEP_DEFINITIONS = EXISTING_ACCOUNT_GOPAY_STEP_DEFINITIONS;
  const PLUS_GPC_STEP_DEFINITIONS = EXISTING_ACCOUNT_GPC_STEP_DEFINITIONS;

  function isPlusModeEnabled(options = {}) {
    return Boolean(options?.plusModeEnabled || options?.plusMode);
  }

  function normalizePlusPaymentMethod(value = '') {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === PLUS_PAYMENT_METHOD_GPC_HELPER) {
      return PLUS_PAYMENT_METHOD_GPC_HELPER;
    }
    return normalized === PLUS_PAYMENT_METHOD_GOPAY ? PLUS_PAYMENT_METHOD_GOPAY : PLUS_PAYMENT_METHOD_PAYPAL;
  }

  function normalizePlusAccountAccessStrategy() {
    return PLUS_ACCOUNT_ACCESS_STRATEGY_OAUTH;
  }

  function shouldUseHostedCheckoutFinalStep(options = {}) {
    // 默认使用 hosted checkout 新分段节点，只有显式关闭时才保留旧的账单和 PayPal 授权节点。
    return options?.plusHostedCheckoutIsFinalStep !== false;
  }

  function normalizeActiveFlowId(value = '', fallback = DEFAULT_ACTIVE_FLOW_ID) {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized) {
      return normalized;
    }
    const fallbackValue = String(fallback || '').trim().toLowerCase();
    return fallbackValue || DEFAULT_ACTIVE_FLOW_ID;
  }

  function getOpenAiModeStepDefinitions(options = {}) {
    const paymentMethod = normalizePlusPaymentMethod(options?.plusPaymentMethod || options?.paymentMethod);
    if (paymentMethod === PLUS_PAYMENT_METHOD_GPC_HELPER) {
      return PLUS_GPC_STEP_DEFINITIONS;
    }
    if (paymentMethod === PLUS_PAYMENT_METHOD_GOPAY) {
      return PLUS_GOPAY_STEP_DEFINITIONS;
    }
    if (shouldUseHostedCheckoutFinalStep(options)) {
      return PLUS_PAYPAL_HOSTED_CHECKOUT_STEP_DEFINITIONS;
    }
    return PLUS_PAYPAL_STEP_DEFINITIONS;
  }

  function getOpenAiPlusPaymentStepTitle(options = {}) {
    if (!isPlusModeEnabled(options)) {
      return '';
    }
    const paymentStep = getOpenAiModeStepDefinitions({
      ...options,
      plusModeEnabled: true,
    }).find((step) => step.key === PLUS_PAYMENT_STEP_KEY);
    return paymentStep?.title || '';
  }

  function getOpenAiResolvedStepTitle(step = {}, options = {}) {
    if (isPlusModeEnabled(options) && step.key === PLUS_PAYMENT_STEP_KEY) {
      return getOpenAiPlusPaymentStepTitle(options) || step.title;
    }
    return step.title;
  }

  const FLOW_DEFINITION_BUILDERS = Object.freeze({
    openai: {
      getAllSteps() {
        const keyed = new Map();
        for (const step of [
          ...PLUS_PAYPAL_STEP_DEFINITIONS,
          ...PLUS_GOPAY_STEP_DEFINITIONS,
          ...PLUS_GPC_STEP_DEFINITIONS,
        ]) {
          const key = `${step.id}:${step.key}`;
          if (!keyed.has(key)) {
            keyed.set(key, step);
          }
        }
        return Array.from(keyed.values()).sort((left, right) => {
          const leftOrder = Number.isFinite(left.order) ? left.order : left.id;
          const rightOrder = Number.isFinite(right.order) ? right.order : right.id;
          if (leftOrder !== rightOrder) return leftOrder - rightOrder;
          return left.id - right.id;
        });
      },
      getModeStepDefinitions: getOpenAiModeStepDefinitions,
      getPlusPaymentStepTitle: getOpenAiPlusPaymentStepTitle,
      resolveStepTitle: getOpenAiResolvedStepTitle,
    },
  });

  function hasFlow(flowId) {
    const normalizedFlowId = normalizeActiveFlowId(flowId, '');
    return Boolean(normalizedFlowId && FLOW_DEFINITION_BUILDERS[normalizedFlowId]);
  }

  function getRegisteredFlowIds() {
    return Object.keys(FLOW_DEFINITION_BUILDERS);
  }

  function getFlowDefinitionBuilder(options = {}) {
    const flowId = normalizeActiveFlowId(options?.activeFlowId, DEFAULT_ACTIVE_FLOW_ID);
    return {
      flowId,
      builder: FLOW_DEFINITION_BUILDERS[flowId] || null,
    };
  }

  function cloneSteps(steps = [], options = {}, flowId = DEFAULT_ACTIVE_FLOW_ID) {
    const { builder } = getFlowDefinitionBuilder({ activeFlowId: flowId });
    return steps.map((step) => ({
      ...step,
      flowId,
      title: builder?.resolveStepTitle ? builder.resolveStepTitle(step, options) : step.title,
    }));
  }

  function cloneNodes(steps = [], options = {}, flowId = DEFAULT_ACTIVE_FLOW_ID) {
    const { builder } = getFlowDefinitionBuilder({ activeFlowId: flowId });
    return steps.map((step) => ({
      legacyStepId: Number(step.id),
      nodeId: String(step.key || '').trim(),
      flowId,
      title: builder?.resolveStepTitle ? builder.resolveStepTitle(step, options) : step.title,
      displayOrder: Number.isFinite(Number(step.order)) ? Number(step.order) : Number(step.id),
      nodeType: 'task',
      sourceId: step.sourceId || '',
      driverId: step.driverId || '',
      executeKey: String(step.key || '').trim(),
      command: String(step.command || step.key || '').trim(),
      mailRuleId: String(step.mailRuleId || '').trim(),
      next: Array.isArray(step.next) ? [...step.next] : [],
      retryPolicy: step.retryPolicy && typeof step.retryPolicy === 'object' ? { ...step.retryPolicy } : {},
      recoveryPolicy: step.recoveryPolicy && typeof step.recoveryPolicy === 'object' ? { ...step.recoveryPolicy } : {},
      ui: step.ui && typeof step.ui === 'object' ? { ...step.ui } : {},
    })).filter((node) => Boolean(node.nodeId));
  }

  function getSteps(options = {}) {
    const { flowId, builder } = getFlowDefinitionBuilder(options);
    if (!builder?.getModeStepDefinitions) {
      return [];
    }
    return cloneSteps(builder.getModeStepDefinitions(options), options, flowId);
  }

  function linkLinearNodes(nodes = []) {
    return nodes.map((node, index) => ({
      ...node,
      next: Array.isArray(node.next) && node.next.length
        ? [...node.next]
        : (nodes[index + 1]?.nodeId ? [nodes[index + 1].nodeId] : []),
    }));
  }

  function getNodes(options = {}) {
    const { flowId, builder } = getFlowDefinitionBuilder(options);
    if (!builder?.getModeStepDefinitions) {
      return [];
    }
    return linkLinearNodes(cloneNodes(builder.getModeStepDefinitions(options), options, flowId));
  }

  function getAllSteps(options = {}) {
    const { flowId, builder } = getFlowDefinitionBuilder(options);
    if (!builder?.getAllSteps) {
      return [];
    }
    return cloneSteps(builder.getAllSteps(options), options, flowId);
  }

  function getAllNodes(options = {}) {
    const { flowId, builder } = getFlowDefinitionBuilder(options);
    if (!builder?.getAllSteps) {
      return [];
    }
    return cloneNodes(builder.getAllSteps(options), options, flowId)
      .sort((left, right) => {
        if (left.displayOrder !== right.displayOrder) return left.displayOrder - right.displayOrder;
        return left.nodeId.localeCompare(right.nodeId);
      });
  }

  function getPlusPaymentStepTitle(options = {}) {
    const { builder } = getFlowDefinitionBuilder(options);
    if (!builder?.getPlusPaymentStepTitle) {
      return '';
    }
    return builder.getPlusPaymentStepTitle(options);
  }

  function getStepIds(options = {}) {
    return getSteps(options)
      .map((step) => Number(step.id))
      .filter(Number.isFinite)
      .sort((left, right) => left - right);
  }

  function getNodeIds(options = {}) {
    return getNodes(options).map((node) => node.nodeId);
  }

  function getLastStepId(options = {}) {
    const ids = getStepIds(options);
    return ids[ids.length - 1] || 0;
  }

  function getStepById(id, options = {}) {
    const numericId = Number(id);
    const { flowId, builder } = getFlowDefinitionBuilder(options);
    if (!builder?.getModeStepDefinitions) {
      return null;
    }
    const match = builder.getModeStepDefinitions(options).find((step) => step.id === numericId);
    return match ? cloneSteps([match], options, flowId)[0] : null;
  }

  function getNodeById(nodeId, options = {}) {
    const normalizedNodeId = String(nodeId || '').trim();
    if (!normalizedNodeId) {
      return null;
    }
    return getNodes(options).find((node) => node.nodeId === normalizedNodeId) || null;
  }

  function getNodeByDisplayOrder(displayOrder, options = {}) {
    const normalizedOrder = Number(displayOrder);
    if (!Number.isFinite(normalizedOrder)) {
      return null;
    }
    return getNodes(options).find((node) => node.displayOrder === normalizedOrder) || null;
  }

  function getWorkflow(options = {}) {
    const flowId = normalizeActiveFlowId(options?.activeFlowId, DEFAULT_ACTIVE_FLOW_ID);
    const nodes = getNodes(options);
    return {
      flowId,
      workflowVersion: 1,
      nodes,
      nodeIds: nodes.map((node) => node.nodeId),
    };
  }

  return {
    DEFAULT_ACTIVE_FLOW_ID,
    STEP_DEFINITIONS: PLUS_PAYPAL_HOSTED_CHECKOUT_STEP_DEFINITIONS,
    PLUS_STEP_DEFINITIONS: PLUS_PAYPAL_STEP_DEFINITIONS,
    PLUS_ACCOUNT_ACCESS_STRATEGY_OAUTH,
    PLUS_PAYPAL_STEP_DEFINITIONS,
    PLUS_PAYPAL_HOSTED_CHECKOUT_STEP_DEFINITIONS,
    PLUS_GOPAY_STEP_DEFINITIONS,
    PLUS_GPC_STEP_DEFINITIONS,
    getAllSteps,
    getAllNodes,
    getLastStepId,
    getNodeByDisplayOrder,
    getNodeById,
    getNodeIds,
    getNodes,
    getPlusPaymentStepTitle,
    getRegisteredFlowIds,
    getStepById,
    getStepIds,
    getSteps,
    getWorkflow,
    hasFlow,
    isPlusModeEnabled,
    normalizePlusAccountAccessStrategy,
    normalizeActiveFlowId,
    normalizePlusPaymentMethod,
  };
});
