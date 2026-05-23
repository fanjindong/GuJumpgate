(function attachMultiPageSourceRegistry(root, factory) {
  root.MultiPageSourceRegistry = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createSourceRegistryModule() {
  const SOURCE_ALIASES = Object.freeze({
    'signup-page': 'openai-auth',
  });

  const SOURCE_DEFINITIONS = Object.freeze({
    'openai-auth': {
      flowId: 'openai',
      kind: 'flow-page',
      label: '认证页',
      readyPolicy: 'allow-child-frame',
      family: 'openai-auth-family',
      driverId: 'content/signup-page',
      cleanupScopes: ['oauth-localhost-callback'],
    },
    chatgpt: {
      flowId: 'openai',
      kind: 'flow-entry',
      label: 'ChatGPT 首页',
      readyPolicy: 'allow-child-frame',
      family: 'chatgpt-entry-family',
      driverId: null,
      cleanupScopes: [],
    },
    'plus-checkout': {
      flowId: 'openai',
      kind: 'flow-page',
      label: 'Plus Checkout',
      readyPolicy: 'top-frame-only',
      family: 'plus-checkout-family',
      driverId: 'content/plus-checkout',
      cleanupScopes: [],
    },
    'paypal-flow': {
      flowId: 'openai',
      kind: 'flow-page',
      label: 'PayPal 授权页',
      readyPolicy: 'allow-child-frame',
      family: 'paypal-flow-family',
      driverId: 'content/paypal-flow',
      cleanupScopes: [],
    },
    'gopay-flow': {
      flowId: 'openai',
      kind: 'flow-page',
      label: 'GoPay 授权页',
      readyPolicy: 'allow-child-frame',
      family: 'gopay-flow-family',
      driverId: 'content/gopay-flow',
      cleanupScopes: [],
    },
    'unknown-source': {
      flowId: null,
      kind: 'unknown',
      label: '未知来源',
      readyPolicy: 'disabled',
      family: 'unknown-family',
      driverId: null,
      cleanupScopes: [],
    },
  });

  const DRIVER_DEFINITIONS = Object.freeze({
    'content/signup-page': {
      sourceId: 'openai-auth',
      commands: [
        'oauth-login',
        'fetch-login-code',
        'confirm-oauth',
        'detect-auth-state',
      ],
    },
    'content/plus-checkout': {
      sourceId: 'plus-checkout',
      commands: ['plus-checkout-create', 'hosted-checkout-submit', 'plus-checkout-billing', 'plus-checkout-return'],
    },
    'content/paypal-flow': {
      sourceId: 'paypal-flow',
      commands: ['paypal-approve', 'hosted-paypal-payment'],
    },
    'content/gopay-flow': {
      sourceId: 'gopay-flow',
      commands: ['gopay-subscription-confirm'],
    },
  });

  const CLEANUP_SCOPE_OWNERS = Object.freeze({
    'oauth-localhost-callback': 'openai-auth',
  });

  const AUTH_PAGE_HOSTS = new Set(['auth0.openai.com', 'auth.openai.com', 'accounts.openai.com']);
  const ENTRY_PAGE_HOSTS = new Set(['chatgpt.com', 'www.chatgpt.com', 'chat.openai.com']);
  const CHILD_FRAME_BLOCKED_SOURCES = new Set(['plus-checkout']);

  function createSourceRegistry() {
    function parseUrlSafely(rawUrl) {
      if (!rawUrl) return null;
      try {
        return new URL(rawUrl);
      } catch {
        return null;
      }
    }

    function normalizeSourceId(source) {
      return String(source || '').trim();
    }

    function resolveCanonicalSource(source) {
      const normalized = normalizeSourceId(source);
      if (!normalized) return '';
      return SOURCE_ALIASES[normalized] || normalized;
    }

    function getAliasKeysForCanonicalSource(source) {
      const canonical = resolveCanonicalSource(source);
      return Object.keys(SOURCE_ALIASES).filter((alias) => SOURCE_ALIASES[alias] === canonical);
    }

    function getSourceKeys(source) {
      const normalized = normalizeSourceId(source);
      const canonical = resolveCanonicalSource(normalized);
      return Array.from(new Set([
        canonical,
        ...getAliasKeysForCanonicalSource(canonical),
        normalized,
      ].filter(Boolean)));
    }

    function getSourceMeta(source) {
      const canonical = resolveCanonicalSource(source);
      const definition = SOURCE_DEFINITIONS[canonical];
      if (!definition) {
        return null;
      }
      return {
        id: canonical,
        aliases: getAliasKeysForCanonicalSource(canonical),
        ...definition,
      };
    }

    function getSourceLabel(source) {
      return getSourceMeta(source)?.label || normalizeSourceId(source) || '未知来源';
    }

    function getDriverIdForSource(source) {
      return getSourceMeta(source)?.driverId || null;
    }

    function getDriverMeta(sourceOrDriverId) {
      const directDriverId = normalizeSourceId(sourceOrDriverId);
      const driverId = Object.prototype.hasOwnProperty.call(DRIVER_DEFINITIONS, directDriverId)
        ? directDriverId
        : getDriverIdForSource(sourceOrDriverId);
      if (!driverId || !Object.prototype.hasOwnProperty.call(DRIVER_DEFINITIONS, driverId)) {
        return null;
      }
      return {
        id: driverId,
        ...DRIVER_DEFINITIONS[driverId],
      };
    }

    function driverAcceptsCommand(sourceOrDriverId, command) {
      const normalizedCommand = normalizeSourceId(command);
      if (!normalizedCommand) {
        return false;
      }
      const driver = getDriverMeta(sourceOrDriverId);
      return Array.isArray(driver?.commands) && driver.commands.includes(normalizedCommand);
    }

    function isSignupPageHost(hostname = '') {
      return AUTH_PAGE_HOSTS.has(String(hostname || '').toLowerCase());
    }

    function isSignupEntryHost(hostname = '') {
      return ENTRY_PAGE_HOSTS.has(String(hostname || '').toLowerCase());
    }

    function matchesSourceUrlFamily(source, candidateUrl) {
      const candidate = parseUrlSafely(candidateUrl);
      if (!candidate) return false;
      const canonical = resolveCanonicalSource(source);
      switch (canonical) {
        case 'openai-auth':
          return isSignupPageHost(candidate.hostname) || isSignupEntryHost(candidate.hostname);
        case 'chatgpt':
          return isSignupEntryHost(candidate.hostname);
        case 'plus-checkout':
          return (candidate.hostname === 'chatgpt.com' && candidate.pathname.startsWith('/checkout/'))
            || candidate.hostname === 'pay.openai.com'
            || candidate.hostname === 'checkout.stripe.com';
        case 'paypal-flow':
          return candidate.hostname.endsWith('paypal.com');
        case 'gopay-flow':
          return /gopay|gojek/i.test(candidate.hostname);
        default:
          return false;
      }
    }

    function detectSourceFromLocation({
      injectedSource,
      url = '',
      hostname = '',
    } = {}) {
      if (injectedSource) return resolveCanonicalSource(injectedSource);
      const normalizedHostname = String(hostname || '').toLowerCase();
      const normalizedUrl = String(url || '');
      if (isSignupPageHost(normalizedHostname)) return 'openai-auth';
      if (normalizedHostname === 'pay.openai.com' || normalizedHostname === 'checkout.stripe.com') return 'plus-checkout';
      if (normalizedHostname === 'www.paypal.com' || normalizedHostname === 'paypal.com') return 'paypal-flow';
      if (/gopay|gojek/i.test(normalizedHostname)) return 'gopay-flow';
      if (normalizedUrl.includes('/checkout/')) return 'plus-checkout';
      if (isSignupEntryHost(normalizedHostname)) return 'chatgpt';
      return 'unknown-source';
    }

    function shouldReportReadyForFrame(source, isChildFrame) {
      const canonical = resolveCanonicalSource(source);
      const readyPolicy = getSourceMeta(canonical)?.readyPolicy || 'allow-child-frame';
      if (readyPolicy === 'disabled') return false;
      if (!isChildFrame) return true;
      if (readyPolicy === 'top-frame-only') return false;
      return !CHILD_FRAME_BLOCKED_SOURCES.has(canonical);
    }

    function getCleanupOwner(scope) {
      return CLEANUP_SCOPE_OWNERS[String(scope || '').trim()] || '';
    }

    return {
      detectSourceFromLocation,
      driverAcceptsCommand,
      getCleanupOwner,
      getDriverIdForSource,
      getDriverMeta,
      getSourceKeys,
      getSourceLabel,
      getSourceMeta,
      matchesSourceUrlFamily,
      resolveCanonicalSource,
      shouldReportReadyForFrame,
    };
  }

  return {
    createSourceRegistry,
    SOURCE_ALIASES,
    SOURCE_DEFINITIONS,
    DRIVER_DEFINITIONS,
  };
});
