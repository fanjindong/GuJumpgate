(function attachBackgroundFetchExistingLoginCode(root, factory) {
  root.MultiPageBackgroundFetchExistingLoginCode = factory(root);
})(typeof self !== 'undefined' ? self : globalThis, function createBackgroundFetchExistingLoginCodeModule(root) {
  const MAILBOX_FETCH_MAX_ATTEMPTS = 3;
  const MAILBOX_FETCH_RETRY_DELAY_MS = 1000;
  // 15 秒要覆盖内容脚本自身 12 秒提交结果等待，同时避免页面跳转后后台继续空等一分钟。
  const CODE_SUBMIT_RESPONSE_TIMEOUT_MS = 15000;
  // 20 秒用于覆盖 ChatGPT 登录成功后的整页跳转和扩展脚本重新就绪窗口。
  const POST_SUBMIT_STATE_TIMEOUT_MS = 20000;
  // 500 毫秒轮询一次足够及时，也避免在跳转期间频繁读取标签页状态。
  const POST_SUBMIT_STATE_POLL_MS = 500;

  function createFetchExistingLoginCodeExecutor(deps = {}) {
    const {
      addLog = async () => {},
      chrome: chromeApi = root.chrome,
      completeNodeFromBackground,
      fetchImpl = root.fetch ? root.fetch.bind(root) : null,
      getTabId = null,
      isRetryableContentScriptTransportError = (error) => {
        const message = String(typeof error === 'string' ? error : error?.message || '');
        return /back\/forward cache|message channel is closed|Receiving end does not exist|port closed before a response was received|A listener indicated an asynchronous response|内容脚本\s+\d+(?:\.\d+)?\s*秒内未响应|did not respond in \d+s/i.test(message);
      },
      sendToContentScript = null,
      sendToContentScriptResilient,
      setState,
      sleepImpl = (ms) => new Promise((resolve) => {
        if (typeof root.setTimeout === 'function') {
          root.setTimeout(resolve, ms);
          return;
        }
        resolve();
      }),
      throwIfStopped = () => {},
    } = deps;

    function resolveMailboxUrl(state = {}) {
      const mailboxUrl = String(state?.existingAccount?.mailboxUrl || '').trim();
      if (!mailboxUrl) {
        throw new Error('缺少 mailbox_url，请先保存账户 JSON。');
      }
      return mailboxUrl;
    }

    function isLikelyLoggedInChatgptHomeUrl(rawUrl = '') {
      const value = String(rawUrl || '').trim();
      if (!value) {
        return false;
      }

      try {
        const parsed = new URL(value);
        const host = String(parsed.hostname || '').toLowerCase();
        if (!['chatgpt.com', 'www.chatgpt.com', 'chat.openai.com'].includes(host)) {
          return false;
        }

        const path = String(parsed.pathname || '');
        return !/^\/(?:auth\/|create-account\/|email-verification|log-in|add-phone)(?:[/?#]|$)/i.test(path);
      } catch {
        return false;
      }
    }

    async function getSignupPageTabUrl() {
      if (typeof getTabId !== 'function' || !chromeApi?.tabs?.get) {
        return '';
      }

      const tabId = await getTabId('signup-page');
      if (!Number.isInteger(tabId)) {
        return '';
      }

      const tab = await chromeApi.tabs.get(tabId).catch(() => null);
      return String(tab?.url || '').trim();
    }

    async function waitForLoggedInPageAfterSubmit() {
      const start = Date.now();

      while (Date.now() - start < POST_SUBMIT_STATE_TIMEOUT_MS) {
        throwIfStopped();
        const url = await getSignupPageTabUrl();
        if (isLikelyLoggedInChatgptHomeUrl(url)) {
          return {
            success: true,
            assumed: true,
            url,
          };
        }

        await sleepImpl(POST_SUBMIT_STATE_POLL_MS);
      }

      return { success: false };
    }

    async function readMailboxPayload(response) {
      try {
        return await response.json();
      } catch {
        throw new Error('验证码接口返回的内容不是有效 JSON。');
      }
    }

    async function fetchMailboxResponse(mailboxUrl) {
      let attempt = 0;
      while (attempt < MAILBOX_FETCH_MAX_ATTEMPTS) {
        throwIfStopped();
        attempt += 1;
        try {
          return await fetchImpl(mailboxUrl, {
            method: 'GET',
            cache: 'no-store',
          });
        } catch {
          throwIfStopped();
          if (attempt >= MAILBOX_FETCH_MAX_ATTEMPTS) {
            throw new Error('验证码接口请求失败：网络请求异常。');
          }
          await sleepImpl(MAILBOX_FETCH_RETRY_DELAY_MS);
          throwIfStopped();
        }
      }
      throw new Error('验证码接口请求失败：网络请求异常。');
    }

    async function submitExistingLoginCode(code) {
      const message = {
        type: 'EXECUTE_NODE',
        nodeId: 'fetch-existing-login-code',
        step: 3,
        payload: { code },
      };

      try {
        if (typeof sendToContentScript === 'function') {
          return await sendToContentScript('signup-page', message, {
            responseTimeoutMs: CODE_SUBMIT_RESPONSE_TIMEOUT_MS,
          });
        }

        return await sendToContentScriptResilient(
          'signup-page',
          message,
          {
            timeoutMs: 60000,
            responseTimeoutMs: 60000,
          }
        );
      } catch (error) {
        if (!isRetryableContentScriptTransportError(error)) {
          throw error;
        }

        // 验证码提交成功会触发整页跳转，原内容脚本可能来不及回包；这里用标签页 URL 确认真实登录结果，避免重复提交验证码。
        const fallback = await waitForLoggedInPageAfterSubmit();
        if (fallback.success) {
          await addLog('验证码提交后内容脚本通信中断，但页面已跳转到 ChatGPT 已登录页，按登录成功继续。', 'warn', {
            step: 3,
            stepKey: 'fetch-existing-login-code',
          });
          return fallback;
        }

        throw error;
      }
    }

    async function executeFetchExistingLoginCode(state = {}) {
      throwIfStopped();

      const mailboxUrl = resolveMailboxUrl(state);
      await addLog('正在通过 mailbox_url 获取登录验证码', 'info', {
        step: 3,
        stepKey: 'fetch-existing-login-code',
      });

      if (typeof fetchImpl !== 'function') {
        throw new Error('验证码接口请求不可用。');
      }

      throwIfStopped();
      const response = await fetchMailboxResponse(mailboxUrl);

      throwIfStopped();
      if (!response?.ok) {
        throw new Error(`验证码接口请求失败：HTTP ${response?.status || 0}`);
      }

      const payload = await readMailboxPayload(response);
      throwIfStopped();

      const code = root.MultiPageExistingAccount.extractMailboxCode(payload);
      await setState({ lastLoginCode: code });

      throwIfStopped();
      const result = await submitExistingLoginCode(code);

      if (result?.error) {
        throw new Error(result.error);
      }

      throwIfStopped();
      await completeNodeFromBackground('fetch-existing-login-code', {
        code,
        ...(result?.assumed ? { assumed: true } : {}),
        ...(result?.url ? { url: result.url } : {}),
      });
    }

    return { executeFetchExistingLoginCode };
  }

  return { createFetchExistingLoginCodeExecutor };
});
