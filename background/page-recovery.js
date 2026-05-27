(function attachBackgroundPageRecovery(root, factory) {
  root.MultiPageBackgroundPageRecovery = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createBackgroundPageRecoveryModule() {
  const DONE_STATUSES = new Set(['completed', 'manual_completed', 'skipped']);
  const PAGE_ORDER = Object.freeze(['chatgpt', 'auth', 'checkout', 'paypal', 'success']);
  const DEFAULT_PAGE_TITLES = Object.freeze({
    chatgpt: 'ChatGPT 页面',
    auth: '认证页',
    checkout: 'Checkout 页面',
    paypal: 'PayPal 页面',
    success: '开通结果',
  });

  function normalizeStatus(value = '') {
    return String(value || '').trim().toLowerCase() || 'pending';
  }

  function isDoneStatus(status = '') {
    return DONE_STATUSES.has(normalizeStatus(status));
  }

  function parseUrlSafely(rawUrl = '') {
    try {
      return new URL(String(rawUrl || '').trim());
    } catch (_error) {
      return null;
    }
  }

  function isChatGptLoggedInUrl(rawUrl = '') {
    const parsed = parseUrlSafely(rawUrl);
    if (!parsed) return false;
    const hostname = parsed.hostname.toLowerCase();
    if (!['chatgpt.com', 'www.chatgpt.com', 'chat.openai.com'].includes(hostname)) {
      return false;
    }
    // 这里只做候选 URL 判断；真正是否已登录必须由调用方通过 session/accessToken 确认。
    return !/^\/(?:auth\/|create-account\/|email-verification|log-in|add-phone)(?:[/?#]|$)/i.test(parsed.pathname || '');
  }

  function isAuthVerificationUrl(rawUrl = '') {
    const parsed = parseUrlSafely(rawUrl);
    if (!parsed) return false;
    const hostname = parsed.hostname.toLowerCase();
    if (!['auth0.openai.com', 'auth.openai.com', 'accounts.openai.com'].includes(hostname)) {
      return false;
    }
    return /verification|verify|challenge|otp|code|mfa/i.test(`${parsed.pathname}${parsed.search}${parsed.hash}`);
  }

  function isHostedCheckoutUrl(rawUrl = '') {
    const parsed = parseUrlSafely(rawUrl);
    if (!parsed) return false;
    const hostname = parsed.hostname.toLowerCase();
    return (hostname === 'pay.openai.com' || hostname === 'checkout.stripe.com')
      && /^\/c\/pay(?:[/?#]|$)/i.test(parsed.pathname || '');
  }

  function isPayPalHostedUrl(rawUrl = '') {
    const parsed = parseUrlSafely(rawUrl);
    if (!parsed) return false;
    const hostname = parsed.hostname.toLowerCase();
    if (hostname !== 'paypal.com' && hostname !== 'www.paypal.com') {
      return false;
    }
    const pathAndSearch = `${parsed.pathname}${parsed.search}`;
    return /checkoutnow|webapps\/hermes|agreements\/approve|billing\/agreements/i.test(pathAndSearch)
      // PayPal Hosted 有时会停在 /pay?token=BA-...，这里必须识别为支付链路，否则会错误回退到失败节点所在页面。
      || (/^\/pay(?:[/?#]|$)/i.test(parsed.pathname || '') && /^BA-/i.test(parsed.searchParams.get('token') || ''));
  }

  /**
   * 创建页面恢复管理器。
   *
   * 页面状态和恢复动作必须集中在后台处理，因为侧边栏只能展示用户意图，
   * 不能绕过后台校验直接修改节点状态或接管标签页。
   */
  function createPageRecoveryManager(deps = {}) {
    const {
      addLog = async () => {},
      chrome = null,
      getNodeDefinitionsForState = () => [],
      getState = async () => ({}),
      registerTab = async () => {},
      setNodeStatus = async () => {},
      setState = async () => {},
      startAutoRunLoop = () => {},
      detectChatGptSessionState = null,
    } = deps;

    function getWorkflowNodes(state = {}) {
      const nodes = typeof getNodeDefinitionsForState === 'function'
        ? getNodeDefinitionsForState(state)
        : [];
      return Array.isArray(nodes) ? nodes : [];
    }

    function buildPages(state = {}, recoverySuggestion = null) {
      const nodes = getWorkflowNodes(state);
      const pagesById = new Map();
      for (const node of nodes) {
        const pageId = String(node?.ui?.pageId || '').trim();
        if (!pageId) continue;
        if (!pagesById.has(pageId)) {
          pagesById.set(pageId, {
            pageId,
            title: String(node?.ui?.pageTitle || DEFAULT_PAGE_TITLES[pageId] || pageId).trim(),
            status: 'pending',
            nodeIds: [],
            activeNodeId: '',
            completedCount: 0,
            totalCount: 0,
            nodes: [],
          });
        }
        const status = normalizeStatus(state?.nodeStatuses?.[node.nodeId]);
        const page = pagesById.get(pageId);
        page.nodeIds.push(node.nodeId);
        page.nodes.push({
          nodeId: node.nodeId,
          title: node.title || node.nodeId,
          status,
        });
      }

      for (const page of pagesById.values()) {
        page.totalCount = page.nodeIds.length;
        page.completedCount = page.nodeIds.filter((nodeId) => isDoneStatus(state?.nodeStatuses?.[nodeId])).length;
        page.activeNodeId = page.nodeIds.find((nodeId) => normalizeStatus(state?.nodeStatuses?.[nodeId]) === 'running')
          || (page.nodeIds.includes(String(state?.currentNodeId || '').trim()) ? String(state.currentNodeId).trim() : '')
          || page.nodeIds.find((nodeId) => !isDoneStatus(state?.nodeStatuses?.[nodeId]))
          || '';
        const pageStatuses = page.nodeIds.map((nodeId) => normalizeStatus(state?.nodeStatuses?.[nodeId]));
        if (recoverySuggestion?.pageId === page.pageId) {
          page.status = 'needs_action';
        } else if (pageStatuses.includes('running')) {
          page.status = 'running';
        } else if (pageStatuses.some((status) => status === 'failed' || status === 'stopped')) {
          page.status = 'needs_action';
        } else if (pageStatuses.length && pageStatuses.every(isDoneStatus)) {
          page.status = 'completed';
        } else if (pageStatuses.some(isDoneStatus)) {
          page.status = 'partial';
        } else {
          page.status = 'pending';
        }
      }

      return PAGE_ORDER
        .map((pageId) => pagesById.get(pageId))
        .filter(Boolean);
    }

    async function getCurrentTab() {
      const activeTabs = await chrome?.tabs?.query?.({ active: true, currentWindow: true }).catch(() => []);
      return Array.isArray(activeTabs) && activeTabs[0] ? activeTabs[0] : null;
    }

    function getNodeStatus(state, nodeId) {
      return normalizeStatus(state?.nodeStatuses?.[nodeId]);
    }

    function isNodeUnfinished(state, nodeId) {
      return !isDoneStatus(getNodeStatus(state, nodeId));
    }

    function findFirstFailedNode(state = {}) {
      return getWorkflowNodes(state).find((node) => ['failed', 'stopped'].includes(getNodeStatus(state, node.nodeId))) || null;
    }

    function buildRetrySuggestionForFailedNode(state = {}) {
      const failedNode = findFirstFailedNode(state);
      const pageId = String(failedNode?.ui?.pageId || '').trim();
      if (!failedNode || !pageId) return null;
      const pageTitle = failedNode.ui?.pageTitle || DEFAULT_PAGE_TITLES[pageId] || pageId;
      return {
        kind: 'retry-page',
        title: `从${pageTitle}重新执行`,
        message: `检测到节点 ${failedNode.nodeId} 已中断，可从所在页面继续排查并重新执行。`,
        pageId,
        primaryLabel: `从${pageTitle}继续`,
        secondaryLabel: '重新检测',
        secondaryAction: 'refresh',
      };
    }

    async function isConfirmedLoggedInChatGptTab(currentTab = null) {
      const currentUrl = String(currentTab?.url || '').trim();
      if (!currentUrl || !isChatGptLoggedInUrl(currentUrl)) {
        return false;
      }
      if (typeof detectChatGptSessionState !== 'function') {
        return false;
      }
      const sessionState = await detectChatGptSessionState(currentTab).catch(() => null);
      return Boolean(sessionState?.loggedIn);
    }

    async function buildRecoverySuggestion(state = {}, currentTab = null) {
      const currentUrl = String(currentTab?.url || '').trim();
      if (currentUrl && await isConfirmedLoggedInChatGptTab(currentTab)
        && (isNodeUnfinished(state, 'existing-account-login') || isNodeUnfinished(state, 'fetch-existing-login-code'))) {
        return {
          kind: 'skip-auth-logged-in',
          title: '检测到已有登录态',
          message: '当前标签页已经是 ChatGPT 登录态，可跳过认证页并从 Checkout 页面继续。',
          pageId: 'auth',
          primaryLabel: '跳过认证并继续',
          secondaryLabel: '从 Checkout 页面重新执行',
        };
      }
      if (currentUrl && isAuthVerificationUrl(currentUrl) && isNodeUnfinished(state, 'fetch-existing-login-code')) {
        return {
          kind: 'continue-auth-code',
          title: '继续认证验证码',
          message: '当前认证页停留在验证码状态，可继续获取登录验证码而不重新提交账号密码。',
          pageId: 'auth',
          primaryLabel: '继续验证码',
          secondaryLabel: '从认证页重新执行',
        };
      }
      if (currentUrl && isHostedCheckoutUrl(currentUrl) && isNodeUnfinished(state, 'hosted-checkout-submit')) {
        return {
          kind: 'adopt-current-checkout',
          title: '接管当前 Checkout 页面',
          message: '检测到当前标签页是 Hosted Checkout，可继续填写而不重新创建订单。',
          pageId: 'checkout',
          primaryLabel: '接管当前 Checkout',
          secondaryLabel: '从 Checkout 页面重新执行',
        };
      }
      if (currentUrl && isPayPalHostedUrl(currentUrl) && isNodeUnfinished(state, 'hosted-paypal-payment')) {
        return {
          kind: 'adopt-current-paypal',
          title: '接管当前 PayPal 页面',
          message: '检测到当前标签页是 PayPal Hosted 支付页，可继续当前支付链路。',
          pageId: 'paypal',
          primaryLabel: '接管当前 PayPal',
          secondaryLabel: '从 PayPal 页面重新执行',
        };
      }
      return buildRetrySuggestionForFailedNode(state);
    }

    /**
     * 获取侧边栏页面步骤和单个恢复建议。
     *
     * 这里只返回一个最高优先级建议，是为了避免用户在异常恢复时面对多个入口而误选。
     */
    async function getPageRecoveryState() {
      const state = await getState();
      const currentTab = await getCurrentTab();
      const recoverySuggestion = await buildRecoverySuggestion(state, currentTab);
      return {
        pages: buildPages(state, recoverySuggestion),
        recoverySuggestion,
        currentTab: currentTab ? { id: currentTab.id, url: currentTab.url || '' } : null,
      };
    }

    function getFirstNodeIdForPage(state = {}, pageId = '') {
      const node = getWorkflowNodes(state).find((item) => String(item?.ui?.pageId || '').trim() === pageId);
      return String(node?.nodeId || '').trim();
    }

    async function markNodes(statuses = {}) {
      for (const [nodeId, status] of Object.entries(statuses)) {
        await setNodeStatus(nodeId, status);
      }
    }

    async function continueFromNode(nodeId) {
      if (!nodeId) {
        throw new Error('恢复目标节点不存在。');
      }
      startAutoRunLoop(1, { mode: 'continue' });
      return { ok: true, startNodeId: nodeId };
    }

    /**
     * 根据用户确认执行页面恢复。
     *
     * 执行前重新读取当前标签页，是为了防止侧栏展示建议后用户又切换到无关页面。
     */
    async function resumeFromPage(payload = {}) {
      const requestedKind = String(payload?.suggestionKind || '').trim();
      const requestedPageId = String(payload?.pageId || '').trim();
      const state = await getState();
      const currentTab = await getCurrentTab();
      const suggestion = await buildRecoverySuggestion(state, currentTab);
      const kind = requestedKind || suggestion?.kind || 'retry-page';
      if (suggestion && requestedKind && suggestion.kind !== requestedKind && requestedKind !== 'retry-page') {
        throw new Error('当前恢复建议已变化，请重新检测恢复建议。');
      }

      if (kind === 'skip-auth-logged-in') {
        if (!await isConfirmedLoggedInChatGptTab(currentTab)) {
          throw new Error('当前标签页不再是 ChatGPT 登录态页面，请重新检测恢复建议。');
        }
        await markNodes({
          'open-chatgpt': 'completed',
          'existing-account-login': 'skipped',
          'fetch-existing-login-code': 'skipped',
        });
        await addLog('检测到已有登录态，因此跳过认证页并继续 Checkout。', 'info');
        return continueFromNode('plus-checkout-create');
      }

      if (kind === 'continue-auth-code') {
        if (!currentTab?.url || !isAuthVerificationUrl(currentTab.url)) {
          throw new Error('当前标签页不再是认证验证码页面，请重新检测恢复建议。');
        }
        if (!isDoneStatus(getNodeStatus(state, 'existing-account-login'))) {
          await setNodeStatus('existing-account-login', 'skipped');
        }
        await addLog('检测到认证验证码页面，正在从登录验证码节点继续。', 'info');
        return continueFromNode('fetch-existing-login-code');
      }

      if (kind === 'adopt-current-checkout') {
        if (!currentTab?.id || !isHostedCheckoutUrl(currentTab.url || '')) {
          throw new Error('当前标签页不再是 Hosted Checkout 页面，请重新检测恢复建议。');
        }
        await setState({ plusCheckoutTabId: currentTab.id, plusCheckoutUrl: currentTab.url || '' });
        await registerTab('plus-checkout', currentTab.id);
        if (!isDoneStatus(getNodeStatus(state, 'plus-checkout-create'))) {
          await setNodeStatus('plus-checkout-create', 'completed');
        }
        await addLog('已接管当前 Hosted Checkout 页面，并从填写节点继续。', 'info');
        return continueFromNode('hosted-checkout-submit');
      }

      if (kind === 'adopt-current-paypal') {
        if (!currentTab?.id || !isPayPalHostedUrl(currentTab.url || '')) {
          throw new Error('当前标签页不再是 PayPal Hosted 页面，请重新检测恢复建议。');
        }
        await setState({ plusCheckoutTabId: currentTab.id });
        await registerTab('paypal-flow', currentTab.id);
        await markNodes({
          'plus-checkout-create': isDoneStatus(getNodeStatus(state, 'plus-checkout-create')) ? getNodeStatus(state, 'plus-checkout-create') : 'completed',
          'hosted-checkout-submit': isDoneStatus(getNodeStatus(state, 'hosted-checkout-submit')) ? getNodeStatus(state, 'hosted-checkout-submit') : 'completed',
        });
        await addLog('已接管当前 PayPal Hosted 页面，并从支付节点继续。', 'info');
        return continueFromNode('hosted-paypal-payment');
      }

      const pageId = requestedPageId || suggestion?.pageId || '';
      const startNodeId = getFirstNodeIdForPage(state, pageId);
      if (!startNodeId) {
        throw new Error('未找到可恢复的页面节点。');
      }
      await addLog(`正在从页面「${DEFAULT_PAGE_TITLES[pageId] || pageId}」继续执行。`, 'info');
      return continueFromNode(startNodeId);
    }

    return {
      buildPages,
      buildRecoverySuggestion,
      getPageRecoveryState,
      resumeFromPage,
    };
  }

  return {
    createPageRecoveryManager,
    isChatGptLoggedInUrl,
    isAuthVerificationUrl,
    isHostedCheckoutUrl,
    isPayPalHostedUrl,
  };
});
