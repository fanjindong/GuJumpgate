(function attachBackgroundExistingAccountLogin(root, factory) {
  root.MultiPageBackgroundExistingAccountLogin = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createBackgroundExistingAccountLoginModule() {
  function createExistingAccountLoginExecutor(deps = {}) {
    const {
      addLog = async () => {},
      completeNodeFromBackground,
      getErrorMessage = (error) => String(error?.message || error || '未知错误'),
      getLoginAuthStateLabel = (state) => String(state || '未知状态'),
      getOAuthFlowStepTimeoutMs,
      isStep6RecoverableResult = () => false,
      isStep6SuccessResult = () => false,
      reuseOrCreateTab,
      sendToContentScriptResilient,
      SIGNUP_PAGE_INJECT_FILES = [],
      STEP6_MAX_ATTEMPTS = 3,
      throwIfStopped = () => {},
    } = deps;

    function normalizeMaxAttempts(value) {
      const attempts = Math.floor(Number(value) || 0);
      return attempts > 0 ? attempts : 3;
    }

    function maskSensitiveText(text = '', password = '') {
      const message = String(text || '');
      if (!password) {
        return message;
      }
      return message.split(String(password)).join('***');
    }

    function getSafeErrorMessage(error, password = '') {
      return maskSensitiveText(getErrorMessage(error), password);
    }

    function createNoRetryError(message) {
      const error = new Error(message);
      error.skipExistingAccountLoginRetry = true;
      return error;
    }

    function resolveExistingAccountCredentials(state = {}) {
      const existingAccount = state?.existingAccount && typeof state.existingAccount === 'object'
        ? state.existingAccount
        : {};
      const email = String(existingAccount.email || state?.email || '').trim();
      const rawPassword = existingAccount.password ?? state?.password ?? '';
      const password = String(rawPassword);

      if (!email || !password.trim()) {
        throw new Error('缺少已有账户邮箱或密码，请先保存账户 JSON。');
      }

      return { email, password };
    }

    async function executeExistingAccountLogin(state = {}) {
      throwIfStopped();

      const { email, password } = resolveExistingAccountCredentials(state);
      const loginUrl = 'https://chatgpt.com/auth/login';
      const loginTimeoutMs = typeof getOAuthFlowStepTimeoutMs === 'function'
        ? await getOAuthFlowStepTimeoutMs(180000, {
          step: 2,
          actionLabel: '已有账户登录',
          oauthUrl: loginUrl,
        })
        : 180000;
      const maxAttempts = normalizeMaxAttempts(STEP6_MAX_ATTEMPTS);
      let attempt = 0;
      let lastError = null;
      const loginTabOptions = { forceNew: true };
      if (Array.isArray(SIGNUP_PAGE_INJECT_FILES) && SIGNUP_PAGE_INJECT_FILES.length > 0) {
        loginTabOptions.inject = SIGNUP_PAGE_INJECT_FILES;
        loginTabOptions.injectSource = 'signup-page';
      }

      while (attempt < maxAttempts) {
        throwIfStopped();
        attempt += 1;

        try {
          await addLog(`正在打开登录页并使用已有账户 ${email} 登录...`, 'info', {
            step: 2,
            stepKey: 'existing-account-login',
          });
          await reuseOrCreateTab('signup-page', loginUrl, loginTabOptions);

          throwIfStopped();
          const result = await sendToContentScriptResilient(
            'signup-page',
            {
              type: 'EXECUTE_NODE',
              nodeId: 'existing-account-login',
              step: 2,
              payload: {
                email,
                password,
                accountIdentifier: email,
                loginIdentifierType: 'email',
                visibleStep: 2,
              },
            },
            {
              timeoutMs: loginTimeoutMs,
              responseTimeoutMs: loginTimeoutMs,
              retryDelayMs: 700,
              logMessage: '登录页正在切换，等待页面重新就绪后继续已有账户登录...',
              logStep: 2,
              logStepKey: 'existing-account-login',
            }
          );

          if (result?.error) {
            throw createNoRetryError(maskSensitiveText(result.error, password));
          }

          if (isStep6SuccessResult(result)) {
            await completeNodeFromBackground('existing-account-login', {
              loginVerificationRequestedAt: result?.loginVerificationRequestedAt || Date.now(),
            });
            return;
          }

          if (isStep6RecoverableResult(result)) {
            const reasonMessage = result.message
              || `当前停留在${getLoginAuthStateLabel(result.state)}，准备重新执行步骤 2。`;
            throw new Error(reasonMessage);
          }

          throw createNoRetryError('步骤 2：认证页未返回可识别的登录结果。');
        } catch (error) {
          throwIfStopped(error);
          if (error?.skipExistingAccountLoginRetry) {
            throw error;
          }
          lastError = error;
          if (attempt >= maxAttempts) {
            break;
          }

          await addLog(`第 ${attempt} 次尝试失败，原因：${getSafeErrorMessage(error, password)}；准备重试...`, 'warn', {
            step: 2,
            stepKey: 'existing-account-login',
          });
        }
      }

      throw new Error(`步骤 2：判断失败后已重试 ${maxAttempts - 1} 次，仍未成功。最后原因：${getSafeErrorMessage(lastError, password)}`);
    }

    return { executeExistingAccountLogin };
  }

  return { createExistingAccountLoginExecutor };
});
