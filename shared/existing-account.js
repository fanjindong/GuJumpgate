(function attachExistingAccount(root, factory) {
  root.MultiPageExistingAccount = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createExistingAccountModule() {
  function normalizeEmail(value = '') {
    return String(value || '').trim();
  }

  function normalizeMailboxUrl(value = '') {
    return String(value || '').trim();
  }

  function assertEmail(email) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error('账户 JSON 中的 email 格式无效。');
    }
  }

  function assertMailboxUrl(mailboxUrl) {
    if (typeof URL === 'function') {
      try {
        const parsed = new URL(mailboxUrl);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          throw new Error('账户 JSON 中的 mailbox_url 必须是 http 或 https 地址。');
        }
        return;
      } catch (error) {
        if (/mailbox_url/.test(String(error?.message || ''))) throw error;
        throw new Error('账户 JSON 中的 mailbox_url 不是有效地址。');
      }
    }

    if (!/^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(mailboxUrl)) {
      throw new Error('账户 JSON 中的 mailbox_url 不是有效地址。');
    }
  }

  function normalizeExistingAccount(input = {}) {
    const email = normalizeEmail(input.email);
    const password = String(input.password || '');
    const mailboxUrl = normalizeMailboxUrl(input.mailbox_url || input.mailboxUrl);

    if (!email) throw new Error('账户 JSON 缺少 email。');
    if (!password) throw new Error('账户 JSON 缺少 password。');
    if (!mailboxUrl) throw new Error('账户 JSON 缺少 mailbox_url。');
    assertEmail(email);
    assertMailboxUrl(mailboxUrl);

    return { email, password, mailboxUrl };
  }

  function parseExistingAccountJson(rawText = '') {
    let parsed = null;
    try {
      parsed = JSON.parse(String(rawText || '').trim());
    } catch {
      throw new Error('账户 JSON 格式错误。');
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('账户 JSON 必须是对象。');
    }
    return normalizeExistingAccount(parsed);
  }

  function extractMailboxCode(payload) {
    const candidates = [
      payload?.code,
      payload?.data?.code,
      payload?.result?.code,
    ];
    const code = candidates
      .map((value) => String(value ?? '').trim())
      .find((value) => /^\d{4,8}$/.test(value));
    if (!code) {
      throw new Error('接口返回中未找到有效验证码。');
    }
    return code;
  }

  function buildExistingAccountState(account) {
    const normalized = normalizeExistingAccount(account);
    return {
      existingAccount: normalized,
      email: normalized.email,
      password: normalized.password,
      accountIdentifierType: 'email',
      accountIdentifier: normalized.email,
    };
  }

  return {
    buildExistingAccountState,
    extractMailboxCode,
    normalizeExistingAccount,
    parseExistingAccountJson,
  };
});
