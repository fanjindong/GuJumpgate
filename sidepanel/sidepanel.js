// sidepanel/sidepanel.js — 精简侧栏逻辑，只绑定当前 HTML 中真实存在的入口。

(() => {
  const STATUS_ICONS = {
    pending: '',
    running: '',
    completed: '\u2713',
    failed: '\u2717',
    stopped: '\u25A0',
    manual_completed: '跳',
    skipped: '跳',
    partial: '…',
    needs_action: '!',
  };
  const DONE_STATUSES = new Set(['completed', 'manual_completed', 'skipped']);
  const AUTO_LOCKED_PHASES = new Set(['running', 'waiting_step', 'waiting_email', 'retrying', 'waiting_interval']);
  const PAYMENT_METHOD_PAYPAL = 'paypal';
  const PAYMENT_METHOD_GOPAY = 'gopay';
  const PAYMENT_METHOD_GPC = 'gpc-helper';
  const DEFAULT_GPC_HELPER_API_URL = 'https://api.gptcard2api.com';
  const SETTINGS_SAVE_IDLE_WAIT_TIMEOUT_MS = 8000;

  const byId = (id) => document.getElementById(id);
  const elements = {
    logArea: byId('log-area'),
    btnOpenAccountRecords: byId('btn-open-account-records'),
    accountRecordsOverlay: byId('account-records-overlay'),
    accountRecordsMeta: byId('account-records-meta'),
    accountRecordsStats: byId('account-records-stats'),
    accountRecordsList: byId('account-records-list'),
    accountRecordsPageLabel: byId('account-records-page-label'),
    btnAccountRecordsPrev: byId('btn-account-records-prev'),
    btnAccountRecordsNext: byId('btn-account-records-next'),
    btnCloseAccountRecords: byId('btn-close-account-records'),
    btnClearAccountRecords: byId('btn-clear-account-records'),
    btnToggleAccountRecordsSelection: byId('btn-toggle-account-records-selection'),
    btnDeleteSelectedAccountRecords: byId('btn-delete-selected-account-records'),
    updateSection: byId('update-section'),
    btnRepoHome: byId('btn-repo-home'),
    extensionUpdateStatus: byId('extension-update-status'),
    extensionVersionMeta: byId('extension-version-meta'),
    btnReleaseLog: byId('btn-release-log'),
    updateCardVersion: byId('update-card-version'),
    updateCardSummary: byId('update-card-summary'),
    updateReleaseList: byId('update-release-list'),
    btnIgnoreRelease: byId('btn-ignore-release'),
    btnOpenRelease: byId('btn-open-release'),
    settingsCard: byId('settings-card'),
    stepsProgress: byId('steps-progress'),
    pageRecoveryCard: byId('page-recovery-card'),
    btnAutoRun: byId('btn-auto-run'),
    btnAutoContinue: byId('btn-auto-continue'),
    autoContinueBar: byId('auto-continue-bar'),
    autoScheduleBar: byId('auto-schedule-bar'),
    autoScheduleTitle: byId('auto-schedule-title'),
    autoScheduleMeta: byId('auto-schedule-meta'),
    btnAutoRunNow: byId('btn-auto-run-now'),
    btnAutoCancelSchedule: byId('btn-auto-cancel-schedule'),
    btnClearLog: byId('btn-clear-log'),
    inputImportSettingsFile: byId('input-import-settings-file'),
    inputRunCount: byId('input-run-count'),
    inputExistingAccountJson: byId('input-existing-account-json'),
    rowPlusMode: byId('row-plus-mode'),
    inputPlusModeEnabled: byId('input-plus-mode-enabled'),
    rowPlusPaymentMethod: byId('row-plus-payment-method'),
    selectPlusPaymentMethod: byId('select-plus-payment-method'),
    btnGpcCardKeyPurchase: byId('btn-gpc-card-key-purchase'),
    plusPaymentMethodCaption: byId('plus-payment-method-caption'),
    rowPayPalAccount: byId('row-paypal-account'),
    selectPayPalAccount: byId('select-paypal-account'),
    paypalAccountPicker: byId('paypal-account-picker'),
    btnPayPalAccountMenu: byId('btn-paypal-account-menu'),
    paypalAccountCurrent: byId('paypal-account-current'),
    paypalAccountMenu: byId('paypal-account-menu'),
    btnAddPayPalAccount: byId('btn-add-paypal-account'),
    rowPlusHostedCheckoutOauthDelay: byId('row-plus-hosted-checkout-oauth-delay'),
    inputPlusHostedCheckoutOauthDelaySeconds: byId('input-plus-hosted-checkout-oauth-delay-seconds'),
    rowPlusCheckoutConversionProxy: byId('row-plus-checkout-conversion-proxy'),
    inputPlusCheckoutConversionProxy: byId('input-plus-checkout-conversion-proxy'),
    rowPlusCheckoutCloudConversion: byId('row-plus-checkout-cloud-conversion'),
    inputPlusCheckoutCloudConversionEnabled: byId('input-plus-checkout-cloud-conversion-enabled'),
    rowPlusCheckoutConversionProxyTest: byId('row-plus-checkout-conversion-proxy-test'),
    btnPlusCheckoutConversionProxyTest: byId('btn-plus-checkout-conversion-proxy-test'),
    displayPlusCheckoutConversionProxyTestResult: byId('display-plus-checkout-conversion-proxy-test-result'),
    rowHostedCheckoutVerificationUrl: byId('row-hosted-checkout-verification-url'),
    inputHostedCheckoutVerificationUrl: byId('input-hosted-checkout-verification-url'),
    rowHostedCheckoutManualFetch: byId('row-hosted-checkout-manual-fetch'),
    btnHostedCheckoutManualFetch: byId('btn-hosted-checkout-manual-fetch'),
    displayHostedCheckoutManualCode: byId('display-hosted-checkout-manual-code'),
    rowHostedCheckoutVerificationPopupDelay: byId('row-hosted-checkout-verification-popup-delay'),
    inputHostedCheckoutVerificationPopupDelaySeconds: byId('input-hosted-checkout-verification-popup-delay-seconds'),
    rowHostedCheckoutPhone: byId('row-hosted-checkout-phone'),
    inputHostedCheckoutPhone: byId('input-hosted-checkout-phone'),
    rowHostedCheckoutSmsPool: byId('row-hosted-checkout-sms-pool'),
    btnToggleHostedSmsPool: byId('btn-toggle-hosted-sms-pool'),
    hostedSmsPoolShell: byId('hosted-sms-pool-shell'),
    inputHostedCheckoutSmsPool: byId('input-hosted-checkout-sms-pool'),
    btnHostedSmsPoolRefresh: byId('btn-hosted-sms-pool-refresh'),
    btnHostedSmsPoolClearUsed: byId('btn-hosted-sms-pool-clear-used'),
    btnHostedSmsPoolDeleteAll: byId('btn-hosted-sms-pool-delete-all'),
    inputHostedSmsPoolImport: byId('input-hosted-sms-pool-import'),
    btnHostedSmsPoolImport: byId('btn-hosted-sms-pool-import'),
    hostedSmsPoolSummary: byId('hosted-sms-pool-summary'),
    inputHostedSmsPoolSearch: byId('input-hosted-sms-pool-search'),
    selectHostedSmsPoolFilter: byId('select-hosted-sms-pool-filter'),
    hostedSmsPoolList: byId('hosted-sms-pool-list'),
    rowGpcHelperApi: byId('row-gpc-helper-api'),
    inputGpcHelperApi: byId('input-gpc-helper-api'),
    btnGpcHelperConvertApiKey: byId('btn-gpc-helper-convert-api-key'),
    rowGpcHelperCardKey: byId('row-gpc-helper-card-key'),
    inputGpcHelperCardKey: byId('input-gpc-helper-card-key'),
    btnToggleGpcHelperCardKey: byId('btn-toggle-gpc-helper-card-key'),
    btnGpcHelperBalance: byId('btn-gpc-helper-balance'),
    displayGpcHelperBalance: byId('display-gpc-helper-balance'),
    rowGpcHelperPhoneMode: byId('row-gpc-helper-phone-mode'),
    selectGpcHelperPhoneMode: byId('select-gpc-helper-phone-mode'),
    rowGpcHelperCountryCode: byId('row-gpc-helper-country-code'),
    selectGpcHelperCountryCode: byId('select-gpc-helper-country-code'),
    rowGpcHelperPhone: byId('row-gpc-helper-phone'),
    inputGpcHelperPhone: byId('input-gpc-helper-phone'),
    rowGpcHelperOtpChannel: byId('row-gpc-helper-otp-channel'),
    selectGpcHelperOtpChannel: byId('select-gpc-helper-otp-channel'),
    rowGpcHelperLocalSmsEnabled: byId('row-gpc-helper-local-sms-enabled'),
    inputGpcHelperLocalSmsEnabled: byId('input-gpc-helper-local-sms-enabled'),
    rowGpcHelperLocalSmsUrl: byId('row-gpc-helper-local-sms-url'),
    inputGpcHelperLocalSmsUrl: byId('input-gpc-helper-local-sms-url'),
    rowGpcHelperPin: byId('row-gpc-helper-pin'),
    inputGpcHelperPin: byId('input-gpc-helper-pin'),
    btnToggleGpcHelperPin: byId('btn-toggle-gpc-helper-pin'),
    rowGoPayCountryCode: byId('row-gopay-country-code'),
    selectGoPayCountryCode: byId('select-gopay-country-code'),
    rowGoPayPhone: byId('row-gopay-phone'),
    inputGoPayPhone: byId('input-gopay-phone'),
    rowGoPayOtp: byId('row-gopay-otp'),
    inputGoPayOtp: byId('input-gopay-otp'),
    rowGoPayPin: byId('row-gopay-pin'),
    inputGoPayPin: byId('input-gopay-pin'),
    btnToggleGoPayPin: byId('btn-toggle-gopay-pin'),
    inputStep6CookieCleanupEnabled: byId('input-step6-cookie-cleanup-enabled'),
    inputOperationDelayEnabled: byId('input-operation-delay-enabled'),
    inputAutoSkipFailures: byId('input-auto-skip-failures'),
    inputAutoStepDelaySeconds: byId('input-auto-step-delay-seconds'),
    btnSaveSettings: byId('btn-save-settings'),
    statusBar: byId('status-bar'),
    displayStatus: byId('display-status'),
    btnStop: byId('btn-stop'),
    btnReset: byId('btn-reset'),
    sharedFormModal: byId('shared-form-modal'),
    sharedFormModalTitle: byId('shared-form-modal-title'),
    btnSharedFormModalClose: byId('btn-shared-form-modal-close'),
    sharedFormModalMessage: byId('shared-form-modal-message'),
    sharedFormModalAlert: byId('shared-form-modal-alert'),
    sharedFormModalFields: byId('shared-form-modal-fields'),
    btnSharedFormModalCancel: byId('btn-shared-form-modal-cancel'),
    btnSharedFormModalConfirm: byId('btn-shared-form-modal-confirm'),
    autoStartModal: byId('auto-start-modal'),
    autoStartMessage: byId('auto-start-message'),
    autoStartAlert: byId('auto-start-alert'),
    modalOptionRow: byId('modal-option-row'),
    modalOptionInput: byId('modal-option-input'),
    modalOptionText: byId('modal-option-text'),
    btnAutoStartClose: byId('btn-auto-start-close'),
    btnAutoStartCancel: byId('btn-auto-start-cancel'),
    btnAutoStartRestart: byId('btn-auto-start-restart'),
    btnAutoStartContinue: byId('btn-auto-start-continue'),
    toastContainer: byId('toast-container'),
    btnTheme: byId('btn-theme'),
  };
  const stepsList = document.querySelector('.steps-list');
  const autoHintText = document.querySelector('.auto-hint');

  let latestState = {};
  let latestPageRecoveryState = { pages: [], recoverySuggestion: null };
  let settingsDirty = false;
  let settingsSaveInFlight = false;
  let settingsAutoSaveTimer = null;
  let autoRunClickHandlerBound = false;
  let accountRecordsManager = null;
  let hostedSmsPoolExpanded = false;
  let activeModalResolver = null;
  let currentAutoRun = {
    autoRunning: false,
    phase: 'idle',
    currentRun: 0,
    totalRuns: 1,
  };

  function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = String(value ?? '');
    return div.innerHTML;
  }

  function setDisplay(element, visible) {
    if (element) {
      element.style.display = visible ? '' : 'none';
    }
  }

  function setText(element, value) {
    if (element) {
      element.textContent = String(value ?? '');
    }
  }

  function normalizePositiveInteger(value, fallback, options = {}) {
    const min = Number.isFinite(options.min) ? options.min : 1;
    const max = Number.isFinite(options.max) ? options.max : Number.MAX_SAFE_INTEGER;
    const numeric = Math.floor(Number(value));
    if (!Number.isFinite(numeric)) {
      return fallback;
    }
    return Math.max(min, Math.min(max, numeric));
  }

  function normalizePaymentMethod(value) {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === PAYMENT_METHOD_GOPAY) return PAYMENT_METHOD_GOPAY;
    if (normalized === PAYMENT_METHOD_GPC) return PAYMENT_METHOD_GPC;
    return PAYMENT_METHOD_PAYPAL;
  }

  function normalizeUrl(value) {
    return String(value || '').trim();
  }

  function normalizeCountryCode(value) {
    const normalized = String(value || '').trim();
    return /^\+\d{1,4}$/.test(normalized) ? normalized : '+86';
  }

  function getSelectedPaymentMethod() {
    return normalizePaymentMethod(elements.selectPlusPaymentMethod?.value || latestState.plusPaymentMethod);
  }

  function getExistingAccountJsonInputValue() {
    return String(elements.inputExistingAccountJson?.value || '').trim();
  }

  function ensureExistingAccountJsonReadyForStart(options = {}) {
    const required = options.required !== false;
    const rawJson = getExistingAccountJsonInputValue();
    if (!rawJson) {
      if (!required) {
        return false;
      }
      elements.inputExistingAccountJson?.focus?.();
      throw new Error('请先填写账户 JSON。');
    }
    try {
      const parsed = JSON.parse(rawJson);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('账户 JSON 必须是对象。');
      }
      if (!String(parsed.email || '').trim()) {
        throw new Error('账户 JSON 缺少 email 字段。');
      }
    } catch (error) {
      elements.inputExistingAccountJson?.focus?.();
      throw new Error(`账户 JSON 格式不正确：${error.message}`);
    }
    return true;
  }

  function normalizeHostedSmsPoolLine(value = '') {
    return String(value || '').trim();
  }

  function hasHostedSmsPoolCandidate(text = '') {
    const lines = String(text || '')
      .replace(/\r/g, '')
      .split('\n')
      .map(normalizeHostedSmsPoolLine)
      .filter(Boolean);

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const separatorIndex = line.indexOf('----');
      const phone = separatorIndex > 0 ? line.slice(0, separatorIndex).trim() : line;
      const verificationUrl = separatorIndex > 0 ? line.slice(separatorIndex + 4).trim() : lines[index + 1];
      // 接码池必须同时提供号码和验证码接口，否则启动后仍会在 PayPal Hosted 阶段失败。
      if (phone && verificationUrl) {
        return true;
      }
    }
    return false;
  }

  function ensurePlusHostedCheckoutReadyForStart() {
    if (getSelectedPaymentMethod() !== PAYMENT_METHOD_PAYPAL) {
      return;
    }

    const verificationUrl = normalizeUrl(elements.inputHostedCheckoutVerificationUrl?.value);
    const phoneNumber = String(elements.inputHostedCheckoutPhone?.value || '').trim();
    const hasSmsPool = hasHostedSmsPoolCandidate(elements.inputHostedCheckoutSmsPool?.value);
    if ((verificationUrl && phoneNumber) || hasSmsPool) {
      return;
    }

    const focusTarget = verificationUrl
      ? elements.inputHostedCheckoutPhone
      : elements.inputHostedCheckoutVerificationUrl;
    focusTarget?.focus?.();
    throw new Error('PayPal Hosted Checkout 启动前请填写“验证码接口 + PayPal 电话(不带+1)”，或导入“Hosted 接码池”。');
  }

  function ensureStartSettingsReady() {
    ensureExistingAccountJsonReadyForStart({ required: false });
    ensurePlusHostedCheckoutReadyForStart();
  }

  function ensureManualNodeSettingsReady(nodeId = '') {
    const normalizedNodeId = String(nodeId || '').trim();
    ensureExistingAccountJsonReadyForStart({
      required: normalizedNodeId !== 'plus-checkout-create',
    });
    if (normalizedNodeId === 'plus-checkout-create') {
      ensurePlusHostedCheckoutReadyForStart();
    }
  }

  function getRunCountValue() {
    return normalizePositiveInteger(elements.inputRunCount?.value, 1, { min: 1, max: 999 });
  }

  function showToast(message, type = 'error', duration = 4000) {
    if (!elements.toastContainer) {
      return;
    }
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <span class="toast-message">${escapeHtml(message)}</span>
      <button class="toast-close" type="button" aria-label="关闭">×</button>
    `;
    elements.toastContainer.appendChild(toast);
    toast.querySelector('.toast-close')?.addEventListener('click', () => toast.remove());
    setTimeout(() => toast.remove(), duration);
  }

  function setStatus(text, status = '') {
    setText(elements.displayStatus, text || '就绪');
    if (elements.statusBar) {
      elements.statusBar.className = `status-bar${status ? ` ${status}` : ''}`;
    }
  }

  function syncLatestState(patch = {}) {
    latestState = {
      ...latestState,
      ...(patch || {}),
    };
  }

  function buildAutoRunState(source = latestState) {
    const phase = String(source?.autoRunPhase || source?.phase || 'idle').trim().toLowerCase() || 'idle';
    return {
      autoRunning: Boolean(source?.autoRunning),
      phase,
      currentRun: Number(source?.autoRunCurrentRun || source?.currentRun || 0) || 0,
      totalRuns: Number(source?.autoRunTotalRuns || source?.totalRuns || elements.inputRunCount?.value || 1) || 1,
      scheduledAt: Number(source?.scheduledAutoRunAt || 0) || 0,
      countdownAt: Number(source?.autoRunCountdownAt || 0) || 0,
      countdownTitle: String(source?.autoRunCountdownTitle || '').trim(),
      countdownNote: String(source?.autoRunCountdownNote || '').trim(),
    };
  }

  function syncAutoRunState(source = latestState) {
    currentAutoRun = buildAutoRunState(source);
  }

  function isDoneStatus(status) {
    return DONE_STATUSES.has(String(status || '').trim().toLowerCase());
  }

  function isAutoRunLockedPhase() {
    return Boolean(currentAutoRun.autoRunning) && AUTO_LOCKED_PHASES.has(currentAutoRun.phase);
  }

  function getWorkflowNodes(state = latestState) {
    const stepModule = window.MultiPageStepDefinitions;
    if (stepModule?.getNodes) {
      return stepModule.getNodes({
        activeFlowId: 'openai',
        plusModeEnabled: true,
        plusPaymentMethod: normalizePaymentMethod(state?.plusPaymentMethod || elements.selectPlusPaymentMethod?.value),
        plusHostedCheckoutIsFinalStep: true,
      });
    }
    return [
      { nodeId: 'open-chatgpt', title: '打开 ChatGPT 官网', displayOrder: 10 },
      { nodeId: 'existing-account-login', title: '登录已有账户', displayOrder: 20 },
      { nodeId: 'fetch-existing-login-code', title: '获取登录验证码', displayOrder: 30 },
      { nodeId: 'plus-checkout-create', title: '创建 Plus Checkout', displayOrder: 40 },
      { nodeId: 'hosted-checkout-submit', title: '填写 Hosted Checkout', displayOrder: 50 },
      { nodeId: 'hosted-paypal-payment', title: '处理 PayPal Hosted 支付', displayOrder: 60 },
      { nodeId: 'plus-activation-success', title: 'Plus 开通成功', displayOrder: 70 },
    ];
  }

  function getNodeStatuses(state = latestState) {
    const nodes = getWorkflowNodes(state);
    const stored = state?.nodeStatuses && typeof state.nodeStatuses === 'object' ? state.nodeStatuses : {};
    return Object.fromEntries(nodes.map((node) => [
      node.nodeId,
      String(stored[node.nodeId] || 'pending').trim().toLowerCase() || 'pending',
    ]));
  }

  function getPageStatusLabel(status = '') {
    const labels = {
      pending: '未开始',
      running: '执行中',
      completed: '已完成',
      needs_action: '需处理',
      partial: '部分完成',
      failed: '失败',
      stopped: '已停止',
    };
    return labels[String(status || '').trim().toLowerCase()] || '未开始';
  }

  function renderNodeRowsForPage(page) {
    const nodes = Array.isArray(page?.nodes) ? page.nodes : [];
    return nodes.map((node) => `
      <div class="page-node-row ${escapeHtml(node.status || 'pending')}" data-node-id="${escapeHtml(node.nodeId)}">
        <div class="page-node-copy">
          <span class="page-node-title">${escapeHtml(node.title || node.nodeId)}</span>
          <span class="page-node-id mono">${escapeHtml(node.nodeId)}</span>
        </div>
        <div class="page-node-actions">
          <span class="step-status" data-node-id="${escapeHtml(node.nodeId)}">${escapeHtml(STATUS_ICONS[node.status] || '')}</span>
          <button class="btn btn-outline btn-xs step-btn" type="button" data-node-id="${escapeHtml(node.nodeId)}">执行</button>
        </div>
      </div>
    `).join('');
  }

  function renderPageRecoveryCard() {
    const suggestion = latestPageRecoveryState?.recoverySuggestion || null;
    if (!elements.pageRecoveryCard) {
      return;
    }
    if (!suggestion) {
      elements.pageRecoveryCard.hidden = true;
      elements.pageRecoveryCard.innerHTML = '';
      return;
    }
    elements.pageRecoveryCard.hidden = false;
    elements.pageRecoveryCard.innerHTML = `
      <div class="page-recovery-copy">
        <span class="page-recovery-title">${escapeHtml(suggestion.title || '可恢复当前流程')}</span>
        <span class="page-recovery-message">${escapeHtml(suggestion.message || '')}</span>
      </div>
      <div class="page-recovery-actions">
        <button class="btn btn-primary btn-sm page-recovery-btn" type="button"
          data-recovery-action="resume"
          data-recovery-kind="${escapeHtml(suggestion.kind || '')}"
          data-page-id="${escapeHtml(suggestion.pageId || '')}">
          ${escapeHtml(suggestion.primaryLabel || '继续')}
        </button>
        <button class="btn btn-outline btn-sm page-recovery-btn" type="button"
          data-recovery-action="${escapeHtml(suggestion.secondaryAction === 'refresh' ? 'refresh' : 'resume')}"
          data-recovery-kind="retry-page"
          data-page-id="${escapeHtml(suggestion.pageId || '')}">
          ${escapeHtml(suggestion.secondaryLabel || '从页面重新执行')}
        </button>
      </div>
    `;
  }

  function renderStepsList() {
    if (!stepsList) {
      return;
    }
    const pages = Array.isArray(latestPageRecoveryState?.pages) && latestPageRecoveryState.pages.length
      ? latestPageRecoveryState.pages
      : [];
    if (!pages.length) {
      const nodes = getWorkflowNodes(latestState);
      stepsList.innerHTML = nodes.map((node, index) => `
        <div class="step-row pending" data-node-id="${escapeHtml(node.nodeId)}">
          <div class="step-main">
            <span class="step-index">${index + 1}</span>
            <div class="step-copy">
              <span class="step-title">${escapeHtml(node.title || node.nodeId)}</span>
              <span class="step-subtitle mono">${escapeHtml(node.nodeId)}</span>
            </div>
          </div>
          <div class="step-actions">
            <span class="step-status" data-node-id="${escapeHtml(node.nodeId)}"></span>
            <button class="btn btn-outline btn-xs step-btn" type="button" data-node-id="${escapeHtml(node.nodeId)}">执行</button>
          </div>
        </div>
      `).join('');
      renderStepStatuses(latestState);
      return;
    }
    stepsList.innerHTML = pages.map((page, index) => `
      <details class="step-page ${escapeHtml(page.status || 'pending')}" data-page-id="${escapeHtml(page.pageId)}">
        <summary class="step-page-summary">
          <div class="step-page-main">
            <span class="step-index">${index + 1}</span>
            <div class="step-copy">
              <span class="step-title">${escapeHtml(page.title || page.pageId)}</span>
              <span class="step-subtitle">${escapeHtml(page.completedCount || 0)} / ${escapeHtml(page.totalCount || 0)} · ${escapeHtml(getPageStatusLabel(page.status))}</span>
            </div>
          </div>
          <span class="step-page-status">${escapeHtml(STATUS_ICONS[page.status] || '')}</span>
        </summary>
        <div class="step-page-nodes">
          ${renderNodeRowsForPage(page)}
        </div>
      </details>
    `).join('');
    renderPageRecoveryCard();
    renderStepStatuses(latestState);
  }

  function renderSingleNodeStatus(nodeId, status) {
    const normalized = String(status || 'pending').trim().toLowerCase() || 'pending';
    const selector = CSS.escape(String(nodeId || ''));
    const row = document.querySelector(`.step-row[data-node-id="${selector}"]`);
    const statusEl = document.querySelector(`.step-status[data-node-id="${selector}"]`);
    if (row) {
      row.className = `step-row ${normalized}`;
    }
    const nodeRow = document.querySelector(`.page-node-row[data-node-id="${selector}"]`);
    if (nodeRow) {
      nodeRow.className = `page-node-row ${normalized}`;
    }
    setText(statusEl, STATUS_ICONS[normalized] || '');
  }

  function renderStepStatuses(state = latestState) {
    const statuses = getNodeStatuses(state);
    Object.entries(statuses).forEach(([nodeId, status]) => renderSingleNodeStatus(nodeId, status));
    updateProgressCounter();
    updateButtonStates();
  }

  function updateProgressCounter() {
    const pages = Array.isArray(latestPageRecoveryState?.pages) ? latestPageRecoveryState.pages : [];
    if (pages.length) {
      const completedPages = pages.filter((page) => String(page.status || '') === 'completed').length;
      setText(elements.stepsProgress, `${completedPages} / ${pages.length}`);
      return;
    }
    const nodes = getWorkflowNodes(latestState);
    const statuses = getNodeStatuses(latestState);
    const completed = Object.values(statuses).filter(isDoneStatus).length;
    setText(elements.stepsProgress, `${completed} / ${nodes.length}`);
  }

  async function refreshPageRecoveryState() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_PAGE_RECOVERY_STATE', source: 'sidepanel' });
      latestPageRecoveryState = {
        pages: Array.isArray(response?.pages) ? response.pages : [],
        recoverySuggestion: response?.recoverySuggestion || null,
      };
      renderStepsList();
    } catch (error) {
      latestPageRecoveryState = { pages: [], recoverySuggestion: null };
      renderPageRecoveryCard();
      console.warn('刷新页面恢复状态失败：', error);
    }
  }

  function updateButtonStates() {
    const statuses = getNodeStatuses(latestState);
    const nodes = getWorkflowNodes(latestState);
    const anyRunning = Object.values(statuses).some((status) => status === 'running');
    const locked = anyRunning || isAutoRunLockedPhase();
    nodes.forEach((node, index) => {
      const button = document.querySelector(`.step-btn[data-node-id="${CSS.escape(node.nodeId)}"]`);
      if (!button) return;
      const previousNode = index > 0 ? nodes[index - 1] : null;
      const previousDone = !previousNode || isDoneStatus(statuses[previousNode.nodeId]);
      const currentStatus = statuses[node.nodeId];
      button.disabled = locked || !(previousDone || currentStatus === 'failed' || isDoneStatus(currentStatus));
    });
    if (elements.btnReset) {
      elements.btnReset.disabled = locked;
    }
    if (elements.btnStop) {
      elements.btnStop.disabled = !locked;
    }
  }

  function updatePlusCheckoutConversionModeUi() {
    const cloudEnabled = Boolean(elements.inputPlusCheckoutCloudConversionEnabled?.checked);
    if (elements.inputPlusCheckoutConversionProxy) {
      elements.inputPlusCheckoutConversionProxy.disabled = cloudEnabled;
      elements.inputPlusCheckoutConversionProxy.readOnly = cloudEnabled;
      elements.inputPlusCheckoutConversionProxy.title = cloudEnabled
        ? '已启用云端支付转换，本地支付转换代理不会生效。'
        : '仅在创建 checkout 并跳转支付页时临时生效。';
    }
    if (elements.btnPlusCheckoutConversionProxyTest) {
      elements.btnPlusCheckoutConversionProxyTest.disabled = cloudEnabled;
    }
    setText(elements.displayPlusCheckoutConversionProxyTestResult, cloudEnabled ? '云端模式' : '未测试');
  }

  function updatePlusModeUI() {
    const method = getSelectedPaymentMethod();
    const paypalVisible = method === PAYMENT_METHOD_PAYPAL;
    const gopayVisible = method === PAYMENT_METHOD_GOPAY;
    const gpcVisible = method === PAYMENT_METHOD_GPC;
    const gpcManual = String(elements.selectGpcHelperPhoneMode?.value || latestState.gopayHelperPhoneMode || 'manual') !== 'auto';
    setDisplay(elements.rowPlusPaymentMethod, true);
    setDisplay(elements.rowPayPalAccount, false);
    setDisplay(elements.btnGpcCardKeyPurchase, gpcVisible);
    setDisplay(elements.rowPlusHostedCheckoutOauthDelay, paypalVisible);
    setDisplay(elements.rowPlusCheckoutConversionProxy, paypalVisible);
    setDisplay(elements.rowPlusCheckoutCloudConversion, paypalVisible);
    setDisplay(elements.rowPlusCheckoutConversionProxyTest, paypalVisible);
    setDisplay(elements.rowHostedCheckoutVerificationUrl, paypalVisible);
    setDisplay(elements.rowHostedCheckoutManualFetch, paypalVisible);
    setDisplay(elements.rowHostedCheckoutVerificationPopupDelay, paypalVisible);
    setDisplay(elements.rowHostedCheckoutPhone, paypalVisible);
    setDisplay(elements.rowHostedCheckoutSmsPool, paypalVisible);
    setDisplay(elements.rowGpcHelperApi, gpcVisible);
    setDisplay(elements.rowGpcHelperCardKey, gpcVisible);
    setDisplay(elements.rowGpcHelperPhoneMode, gpcVisible);
    setDisplay(elements.rowGpcHelperCountryCode, gpcVisible && gpcManual);
    setDisplay(elements.rowGpcHelperPhone, gpcVisible && gpcManual);
    setDisplay(elements.rowGpcHelperOtpChannel, gpcVisible && gpcManual);
    setDisplay(elements.rowGpcHelperLocalSmsEnabled, gpcVisible && gpcManual);
    setDisplay(elements.rowGpcHelperLocalSmsUrl, gpcVisible && gpcManual && elements.inputGpcHelperLocalSmsEnabled?.checked);
    setDisplay(elements.rowGpcHelperPin, gpcVisible && gpcManual);
    setDisplay(elements.rowGoPayCountryCode, gopayVisible);
    setDisplay(elements.rowGoPayPhone, gopayVisible);
    setDisplay(elements.rowGoPayOtp, gopayVisible);
    setDisplay(elements.rowGoPayPin, gopayVisible);
    setText(elements.plusPaymentMethodCaption, gpcVisible
      ? `GPC ${gpcManual ? '手动' : '自动'}订阅链路`
      : (gopayVisible ? 'GoPay 印尼订阅链路' : 'PayPal 订阅链路'));
    updatePlusCheckoutConversionModeUi();
    renderStepsList();
  }

  function collectSettingsPayload() {
    return {
      activeFlowId: 'openai',
      panelMode: 'local-cpa-json',
      plusModeEnabled: true,
      plusAccountAccessStrategy: 'oauth',
      existingAccountJson: getExistingAccountJsonInputValue(),
      plusPaymentMethod: getSelectedPaymentMethod(),
      plusHostedCheckoutOauthDelaySeconds: normalizePositiveInteger(elements.inputPlusHostedCheckoutOauthDelaySeconds?.value, 10, { min: 0, max: 3600 }),
      plusCheckoutConversionProxyUrl: normalizeUrl(elements.inputPlusCheckoutConversionProxy?.value),
      plusCheckoutCloudConversionEnabled: elements.inputPlusCheckoutCloudConversionEnabled
        ? Boolean(elements.inputPlusCheckoutCloudConversionEnabled.checked)
        : true,
      hostedCheckoutVerificationUrl: normalizeUrl(elements.inputHostedCheckoutVerificationUrl?.value),
      hostedCheckoutVerificationPopupDelaySeconds: normalizePositiveInteger(elements.inputHostedCheckoutVerificationPopupDelaySeconds?.value, 5, { min: 0, max: 60 }),
      hostedCheckoutPhoneNumber: String(elements.inputHostedCheckoutPhone?.value || '').trim(),
      hostedCheckoutSmsPoolText: String(elements.inputHostedCheckoutSmsPool?.value || '').trim(),
      gopayCountryCode: normalizeCountryCode(elements.selectGoPayCountryCode?.value),
      gopayPhone: String(elements.inputGoPayPhone?.value || '').trim(),
      gopayOtp: String(elements.inputGoPayOtp?.value || '').trim(),
      gopayPin: String(elements.inputGoPayPin?.value || ''),
      gopayHelperApiUrl: normalizeUrl(elements.inputGpcHelperApi?.value || DEFAULT_GPC_HELPER_API_URL),
      gopayHelperApiKey: String(elements.inputGpcHelperCardKey?.value || '').trim(),
      gopayHelperCardKey: String(elements.inputGpcHelperCardKey?.value || '').trim(),
      gopayHelperPhoneMode: String(elements.selectGpcHelperPhoneMode?.value || 'manual').trim() || 'manual',
      gopayHelperCountryCode: normalizeCountryCode(elements.selectGpcHelperCountryCode?.value),
      gopayHelperPhoneNumber: String(elements.inputGpcHelperPhone?.value || '').trim(),
      gopayHelperOtpChannel: String(elements.selectGpcHelperOtpChannel?.value || 'whatsapp').trim() || 'whatsapp',
      gopayHelperLocalSmsHelperEnabled: Boolean(elements.inputGpcHelperLocalSmsEnabled?.checked),
      gopayHelperLocalSmsHelperUrl: normalizeUrl(elements.inputGpcHelperLocalSmsUrl?.value),
      gopayHelperPin: String(elements.inputGpcHelperPin?.value || ''),
      autoRunSkipFailures: Boolean(elements.inputAutoSkipFailures?.checked),
      autoStepDelaySeconds: normalizePositiveInteger(elements.inputAutoStepDelaySeconds?.value, 0, { min: 0, max: 600 }),
      operationDelayEnabled: elements.inputOperationDelayEnabled ? Boolean(elements.inputOperationDelayEnabled.checked) : true,
      step6CookieCleanupEnabled: elements.inputStep6CookieCleanupEnabled ? Boolean(elements.inputStep6CookieCleanupEnabled.checked) : true,
    };
  }

  function applySettingsState(state = {}) {
    syncLatestState(state);
    syncAutoRunState(state);
    if (elements.inputExistingAccountJson && Object.prototype.hasOwnProperty.call(state, 'existingAccountJson')) {
      elements.inputExistingAccountJson.value = String(state.existingAccountJson || '');
    }
    if (elements.selectPlusPaymentMethod) {
      elements.selectPlusPaymentMethod.value = normalizePaymentMethod(state.plusPaymentMethod);
    }
    if (elements.inputPlusHostedCheckoutOauthDelaySeconds) {
      elements.inputPlusHostedCheckoutOauthDelaySeconds.value = String(normalizePositiveInteger(state.plusHostedCheckoutOauthDelaySeconds, 10, { min: 0, max: 3600 }));
    }
    if (elements.inputPlusCheckoutConversionProxy) {
      elements.inputPlusCheckoutConversionProxy.value = String(state.plusCheckoutConversionProxyUrl || '');
    }
    if (elements.inputPlusCheckoutCloudConversionEnabled) {
      elements.inputPlusCheckoutCloudConversionEnabled.checked = state.plusCheckoutCloudConversionEnabled !== undefined
        ? Boolean(state.plusCheckoutCloudConversionEnabled)
        : true;
    }
    if (elements.inputHostedCheckoutVerificationUrl) {
      elements.inputHostedCheckoutVerificationUrl.value = String(state.hostedCheckoutVerificationUrl || '');
    }
    if (elements.inputHostedCheckoutVerificationPopupDelaySeconds) {
      elements.inputHostedCheckoutVerificationPopupDelaySeconds.value = String(normalizePositiveInteger(state.hostedCheckoutVerificationPopupDelaySeconds, 5, { min: 0, max: 60 }));
    }
    if (elements.inputHostedCheckoutPhone) {
      elements.inputHostedCheckoutPhone.value = String(state.hostedCheckoutPhoneNumber || '');
    }
    if (elements.inputHostedCheckoutSmsPool) {
      elements.inputHostedCheckoutSmsPool.value = String(state.hostedCheckoutSmsPoolText || '');
    }
    if (elements.inputGpcHelperApi) {
      elements.inputGpcHelperApi.value = String(state.gopayHelperApiUrl || DEFAULT_GPC_HELPER_API_URL);
    }
    if (elements.inputGpcHelperCardKey) {
      elements.inputGpcHelperCardKey.value = String(state.gopayHelperApiKey || state.gopayHelperCardKey || '');
    }
    if (elements.selectGpcHelperPhoneMode) {
      elements.selectGpcHelperPhoneMode.value = String(state.gopayHelperPhoneMode || 'manual');
    }
    if (elements.selectGpcHelperCountryCode) {
      elements.selectGpcHelperCountryCode.value = normalizeCountryCode(state.gopayHelperCountryCode);
    }
    if (elements.inputGpcHelperPhone) {
      elements.inputGpcHelperPhone.value = String(state.gopayHelperPhoneNumber || '');
    }
    if (elements.selectGpcHelperOtpChannel) {
      elements.selectGpcHelperOtpChannel.value = String(state.gopayHelperOtpChannel || 'whatsapp');
    }
    if (elements.inputGpcHelperLocalSmsEnabled) {
      elements.inputGpcHelperLocalSmsEnabled.checked = Boolean(state.gopayHelperLocalSmsHelperEnabled);
    }
    if (elements.inputGpcHelperLocalSmsUrl) {
      elements.inputGpcHelperLocalSmsUrl.value = String(state.gopayHelperLocalSmsHelperUrl || '');
    }
    if (elements.inputGpcHelperPin) {
      elements.inputGpcHelperPin.value = String(state.gopayHelperPin || '');
    }
    if (elements.displayGpcHelperBalance) {
      elements.displayGpcHelperBalance.textContent = state.gopayHelperBalanceError
        ? `余额查询失败：${state.gopayHelperBalanceError}`
        : (state.gopayHelperBalance || '余额未获取');
    }
    if (elements.selectGoPayCountryCode) {
      elements.selectGoPayCountryCode.value = normalizeCountryCode(state.gopayCountryCode);
    }
    if (elements.inputGoPayPhone) {
      elements.inputGoPayPhone.value = String(state.gopayPhone || '');
    }
    if (elements.inputGoPayOtp) {
      elements.inputGoPayOtp.value = String(state.gopayOtp || '');
    }
    if (elements.inputGoPayPin) {
      elements.inputGoPayPin.value = String(state.gopayPin || '');
    }
    if (elements.inputAutoSkipFailures) {
      elements.inputAutoSkipFailures.checked = Boolean(state.autoRunSkipFailures);
    }
    if (elements.inputAutoStepDelaySeconds) {
      elements.inputAutoStepDelaySeconds.value = String(normalizePositiveInteger(state.autoStepDelaySeconds, 0, { min: 0, max: 600 }));
    }
    if (elements.inputOperationDelayEnabled) {
      elements.inputOperationDelayEnabled.checked = state.operationDelayEnabled !== undefined ? Boolean(state.operationDelayEnabled) : true;
    }
    if (elements.inputStep6CookieCleanupEnabled) {
      elements.inputStep6CookieCleanupEnabled.checked = state.step6CookieCleanupEnabled !== undefined ? Boolean(state.step6CookieCleanupEnabled) : true;
    }
    renderLogs(state.logs || []);
    renderStepStatuses(state);
    applyAutoRunStatus(state);
    updatePlusModeUI();
    accountRecordsManager?.render?.();
  }

  function markSettingsDirty(isDirty = true) {
    settingsDirty = isDirty;
    updateSaveButtonState();
  }

  function updateSaveButtonState() {
    if (!elements.btnSaveSettings) return;
    elements.btnSaveSettings.disabled = settingsSaveInFlight || !settingsDirty;
    elements.btnSaveSettings.textContent = settingsSaveInFlight ? '保存中' : '保存';
  }

  function scheduleSettingsAutoSave() {
    clearTimeout(settingsAutoSaveTimer);
    settingsAutoSaveTimer = setTimeout(() => {
      saveSettings({ silent: true }).catch(() => {});
    }, 500);
  }

  async function sendRuntimeMessageWithTimeout(message, timeoutMs = 20000, timeoutLabel = '请求') {
    const effectiveTimeoutMs = Math.max(1000, Number(timeoutMs) || 20000);
    let timer = null;
    try {
      return await Promise.race([
        chrome.runtime.sendMessage(message),
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            reject(new Error(`${timeoutLabel}超时（>${Math.round(effectiveTimeoutMs / 1000)} 秒）`));
          }, effectiveTimeoutMs);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function waitForSettingsSaveIdle(timeoutMs = SETTINGS_SAVE_IDLE_WAIT_TIMEOUT_MS) {
    const startedAt = Date.now();
    while (settingsSaveInFlight) {
      if (Date.now() - startedAt > timeoutMs) {
        settingsSaveInFlight = false;
        updateSaveButtonState();
        throw new Error('保存配置仍在进行或已卡住，请刷新侧栏后重试。');
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  async function saveSettings(options = {}) {
    const { silent = false, force = false } = options;
    clearTimeout(settingsAutoSaveTimer);
    if (!force && !settingsDirty && silent) {
      return;
    }
    const payload = collectSettingsPayload();
    settingsSaveInFlight = true;
    updateSaveButtonState();
    try {
      const response = await sendRuntimeMessageWithTimeout({
        type: 'SAVE_SETTING',
        source: 'sidepanel',
        payload,
      }, 15000, '保存配置');
      if (response?.error) throw new Error(response.error);
      applySettingsState(response?.state || { ...latestState, ...payload });
      settingsDirty = false;
      if (!silent) showToast('配置已保存', 'success', 1800);
    } catch (error) {
      settingsDirty = true;
      if (!silent) showToast(`保存失败：${error.message}`, 'error');
      throw error;
    } finally {
      settingsSaveInFlight = false;
      updateSaveButtonState();
    }
  }

  async function getCurrentSidepanelWindowId() {
    try {
      const currentWindow = await chrome.windows?.getCurrent?.();
      const windowId = Number(currentWindow?.id);
      return Number.isFinite(windowId) ? windowId : undefined;
    } catch {
      return undefined;
    }
  }

  async function sendSidepanelMessage(message = {}) {
    const windowId = await getCurrentSidepanelWindowId();
    return chrome.runtime.sendMessage({
      ...(message || {}),
      source: message.source || 'sidepanel',
      automationWindowId: windowId,
    });
  }

  window.sendSidepanelMessage = sendSidepanelMessage;

  function createAutoRunStartTrace() {
    const startedAt = Date.now();
    return (stage, detail = {}) => {
      // 自动启动链路较长，分段日志用于定位卡点；敏感内容不输出明文。
      const safeDetail = JSON.parse(JSON.stringify(detail, (key, value) => (
        /json|password|key|token|secret|authorization/i.test(key) && value ? '***' : value
      )));
      console.info('[自动运行启动]', `${stage} +${Date.now() - startedAt}ms`, safeDetail);
    };
  }

  function setAutoRunStageButton(label = '准备中...') {
    if (!elements.btnAutoRun) return;
    elements.btnAutoRun.disabled = true;
    elements.btnAutoRun.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg> ${escapeHtml(label)}`;
  }

  function setDefaultAutoRunButton() {
    if (!elements.btnAutoRun) return;
    elements.btnAutoRun.disabled = false;
    elements.btnAutoRun.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg> 自动';
  }

  async function startAutoRunFromCurrentSettings() {
    const trace = createAutoRunStartTrace();
    trace('账户 JSON 校验：开始', { hasExistingAccountJson: Boolean(getExistingAccountJsonInputValue()) });
    setAutoRunStageButton('检查配置...');
    ensureStartSettingsReady();
    trace('配置保存：开始');
    setAutoRunStageButton('保存配置...');
    await waitForSettingsSaveIdle();
    await saveSettings({ silent: true, force: true });
    const totalRuns = getRunCountValue();
    const payload = {
      totalRuns,
      existingAccountJson: getExistingAccountJsonInputValue(),
      autoRunSkipFailures: Boolean(elements.inputAutoSkipFailures?.checked),
      mode: 'restart',
    };
    trace('后台启动消息：开始', payload);
    setAutoRunStageButton('启动中...');
    const response = await sendSidepanelMessage({
      type: 'AUTO_RUN',
      source: 'sidepanel',
      payload,
    });
    if (response?.error) throw new Error(response.error);
    trace('自动运行启动：完成');
    return true;
  }

  async function handleAutoRunClick() {
    setAutoRunStageButton('准备中...');
    try {
      const started = await startAutoRunFromCurrentSettings();
      if (!started) setDefaultAutoRunButton();
    } catch (error) {
      setDefaultAutoRunButton();
      showToast(error.message, 'error');
      console.error('[自动运行启动] 点击处理失败', error);
    }
  }

  function bindAutoRunClickHandler() {
    if (!elements.btnAutoRun || autoRunClickHandlerBound) return;
    autoRunClickHandlerBound = true;
    elements.btnAutoRun.addEventListener('click', handleAutoRunClick);
  }

  function applyAutoRunStatus(payload = latestState) {
    syncAutoRunState(payload);
    const locked = isAutoRunLockedPhase();
    if (elements.inputRunCount) {
      elements.inputRunCount.disabled = locked;
      if (currentAutoRun.totalRuns > 0 && locked) {
        elements.inputRunCount.value = String(currentAutoRun.totalRuns);
      }
    }
    if (currentAutoRun.phase === 'scheduled' || currentAutoRun.phase === 'waiting_interval') {
      setDisplay(elements.autoScheduleBar, true);
      setText(elements.autoScheduleTitle, currentAutoRun.countdownTitle || '已计划自动运行');
      setText(elements.autoScheduleMeta, currentAutoRun.countdownNote || '等待倒计时开始...');
      if (elements.btnAutoRunNow) {
        elements.btnAutoRunNow.textContent = currentAutoRun.phase === 'waiting_interval' ? '立即继续' : '立即开始';
      }
    } else {
      setDisplay(elements.autoScheduleBar, false);
    }
    setDisplay(elements.autoContinueBar, currentAutoRun.phase === 'waiting_email');
    if (locked) {
      elements.btnAutoRun && (elements.btnAutoRun.disabled = true);
      if (elements.btnAutoRun) {
        elements.btnAutoRun.textContent = currentAutoRun.phase === 'retrying' ? '重试中' : '运行中';
      }
    } else {
      setDefaultAutoRunButton();
    }
    updateButtonStates();
  }

  function appendLog(entry = {}) {
    if (!elements.logArea) return;
    const line = document.createElement('div');
    const level = String(entry.level || 'info').trim().toLowerCase();
    line.className = `log-line log-${level}`;
    const time = entry.time ? new Date(entry.time).toLocaleString('zh-CN', { hour12: false }) : new Date().toLocaleTimeString('zh-CN', { hour12: false });
    line.innerHTML = `<span class="log-time">${escapeHtml(time)}</span> <span class="log-level log-level-${escapeHtml(level)}">${escapeHtml(level)}</span> <span class="log-msg">${escapeHtml(entry.message || '')}</span>`;
    elements.logArea.appendChild(line);
    elements.logArea.scrollTop = elements.logArea.scrollHeight;
  }

  function renderLogs(logs = []) {
    if (!elements.logArea) return;
    elements.logArea.innerHTML = '';
    (Array.isArray(logs) ? logs : []).slice(-300).forEach(appendLog);
  }

  function openExternalUrl(url) {
    const target = String(url || '').trim();
    if (!target) return;
    chrome.tabs?.create?.({ url: target }).catch(() => {});
  }

  function openConfirmModal({ title, message, confirmLabel = '确认', confirmVariant = 'btn-primary' } = {}) {
    if (!elements.autoStartModal) {
      return Promise.resolve(window.confirm(message || title || '确认操作？'));
    }
    return new Promise((resolve) => {
      activeModalResolver = resolve;
      setText(elements.autoStartModal.querySelector('.modal-title'), title || '确认');
      setText(elements.autoStartMessage, message || '');
      elements.modalOptionRow && (elements.modalOptionRow.hidden = true);
      elements.btnAutoStartRestart && (elements.btnAutoStartRestart.hidden = true);
      if (elements.btnAutoStartContinue) {
        elements.btnAutoStartContinue.textContent = confirmLabel;
        elements.btnAutoStartContinue.className = `btn ${confirmVariant} btn-sm`;
      }
      elements.autoStartModal.hidden = false;
    });
  }

  function closeConfirmModal(value) {
    if (elements.autoStartModal) {
      elements.autoStartModal.hidden = true;
    }
    const resolver = activeModalResolver;
    activeModalResolver = null;
    resolver?.(value);
  }

  function openInputModal({ title, message, placeholder = '', confirmLabel = '确认' } = {}) {
    if (!elements.sharedFormModal) {
      return Promise.resolve(window.prompt(message || title || '', '') || '');
    }
    return new Promise((resolve) => {
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        elements.sharedFormModal.hidden = true;
        resolve(value);
      };
      setText(elements.sharedFormModalTitle, title || '输入');
      setText(elements.sharedFormModalMessage, message || '');
      elements.sharedFormModalMessage.hidden = !message;
      elements.sharedFormModalAlert.hidden = true;
      elements.sharedFormModalFields.innerHTML = `<input id="sidepanel-modal-input" class="data-input" type="text" placeholder="${escapeHtml(placeholder)}" />`;
      const input = elements.sharedFormModalFields.querySelector('input');
      elements.btnSharedFormModalConfirm.textContent = confirmLabel;
      elements.btnSharedFormModalCancel.onclick = () => finish(null);
      elements.btnSharedFormModalClose.onclick = () => finish(null);
      elements.btnSharedFormModalConfirm.onclick = () => finish(String(input?.value || '').trim());
      elements.sharedFormModal.hidden = false;
      input?.focus?.();
    });
  }

  async function resolveManualConfirmation(state = latestState) {
    if (!state?.plusManualConfirmationPending) return;
    const method = String(state.plusManualConfirmationMethod || '').trim().toLowerCase();
    const requestId = String(state.plusManualConfirmationRequestId || '').trim();
    const title = state.plusManualConfirmationTitle || (method === 'gopay-otp' ? 'GPC OTP 验证' : '手动确认');
    const message = state.plusManualConfirmationMessage || '请确认后继续。';
    let payload = { confirmed: false, requestId, step: Number(state.plusManualConfirmationStep) || 0 };
    if (method === 'gopay-otp') {
      const code = await openInputModal({ title, message, placeholder: '请输入 OTP 验证码', confirmLabel: '提交' });
      payload = { ...payload, confirmed: Boolean(code), value: code || '', code: code || '' };
    } else {
      const confirmed = await openConfirmModal({ title, message, confirmLabel: '已完成，继续' });
      payload = { ...payload, confirmed: Boolean(confirmed) };
    }
    await chrome.runtime.sendMessage({
      type: 'RESOLVE_PLUS_MANUAL_CONFIRMATION',
      source: 'sidepanel',
      payload,
    });
  }

  async function restoreState() {
    const state = await chrome.runtime.sendMessage({ type: 'GET_STATE', source: 'sidepanel' });
    applySettingsState(state || {});
    await refreshPageRecoveryState();
  }

  async function initializeReleaseInfo() {
    const service = window.SidepanelUpdateService;
    const manifest = chrome.runtime?.getManifest?.() || {};
    const localVersion = service?.getLocalVersionLabel?.(manifest) || `GuJumpgate ${manifest.version || ''}`.trim();
    setText(elements.extensionUpdateStatus, localVersion || 'GuJumpgate');
    elements.btnRepoHome?.addEventListener('click', () => openExternalUrl(service?.repositoryUrl || 'https://github.com/FoundZiGu/GuJumpgate'));
    elements.extensionUpdateStatus?.addEventListener('click', () => openExternalUrl(service?.releasesPageUrl || 'https://github.com/FoundZiGu/GuJumpgate/releases'));
    elements.btnOpenRelease?.addEventListener('click', () => openExternalUrl(service?.releasesPageUrl || 'https://github.com/FoundZiGu/GuJumpgate/releases'));
    elements.btnReleaseLog?.addEventListener('click', () => setDisplay(elements.updateSection, true));
  }

  function initAccountRecordsManager() {
    const factory = window.SidepanelAccountRecordsManager?.createAccountRecordsManager;
    if (!factory) return;
    accountRecordsManager = factory({
      state: {
        getState: () => latestState,
        getLatestState: () => latestState,
        syncLatestState,
      },
      dom: elements,
      runtime: {
        sendMessage: (message) => chrome.runtime.sendMessage(message),
      },
      helpers: {
        escapeHtml,
        showToast,
        openConfirmModal,
      },
      constants: {
        displayTimeZone: 'Asia/Shanghai',
        pageSize: 10,
      },
    });
    accountRecordsManager.bindEvents();
  }

  function bindPasswordVisibilityToggles() {
    document.querySelectorAll('[data-password-toggle]').forEach((button) => {
      const input = byId(button.dataset.passwordToggle || '');
      if (!input) return;
      button.addEventListener('click', () => {
        input.type = input.type === 'password' ? 'text' : 'password';
        button.setAttribute('aria-label', input.type === 'password'
          ? (button.dataset.showLabel || '显示')
          : (button.dataset.hideLabel || '隐藏'));
      });
    });
  }

  function bindHostedSmsPoolControls() {
    elements.btnToggleHostedSmsPool?.addEventListener('click', () => {
      hostedSmsPoolExpanded = !hostedSmsPoolExpanded;
      if (elements.hostedSmsPoolShell) {
        elements.hostedSmsPoolShell.hidden = !hostedSmsPoolExpanded;
        elements.hostedSmsPoolShell.classList.toggle('is-collapsed', !hostedSmsPoolExpanded);
      }
      elements.btnToggleHostedSmsPool.textContent = hostedSmsPoolExpanded ? '收起' : '展开';
      elements.btnToggleHostedSmsPool.setAttribute('aria-expanded', hostedSmsPoolExpanded ? 'true' : 'false');
    });
    elements.btnHostedSmsPoolImport?.addEventListener('click', () => {
      const imported = String(elements.inputHostedSmsPoolImport?.value || '').trim();
      if (!imported) {
        showToast('请先填写要导入的 Hosted 接码数据。', 'warn');
        return;
      }
      elements.inputHostedCheckoutSmsPool.value = [
        String(elements.inputHostedCheckoutSmsPool.value || '').trim(),
        imported,
      ].filter(Boolean).join('\n');
      elements.inputHostedSmsPoolImport.value = '';
      markSettingsDirty(true);
      scheduleSettingsAutoSave();
    });
  }

  function bindSettingsInputs() {
    [
      elements.inputExistingAccountJson,
      elements.selectPlusPaymentMethod,
      elements.inputPlusHostedCheckoutOauthDelaySeconds,
      elements.inputPlusCheckoutConversionProxy,
      elements.inputPlusCheckoutCloudConversionEnabled,
      elements.inputHostedCheckoutVerificationUrl,
      elements.inputHostedCheckoutVerificationPopupDelaySeconds,
      elements.inputHostedCheckoutPhone,
      elements.inputHostedCheckoutSmsPool,
      elements.inputGpcHelperApi,
      elements.inputGpcHelperCardKey,
      elements.selectGpcHelperPhoneMode,
      elements.selectGpcHelperCountryCode,
      elements.inputGpcHelperPhone,
      elements.selectGpcHelperOtpChannel,
      elements.inputGpcHelperLocalSmsEnabled,
      elements.inputGpcHelperLocalSmsUrl,
      elements.inputGpcHelperPin,
      elements.selectGoPayCountryCode,
      elements.inputGoPayPhone,
      elements.inputGoPayOtp,
      elements.inputGoPayPin,
      elements.inputStep6CookieCleanupEnabled,
      elements.inputOperationDelayEnabled,
      elements.inputAutoSkipFailures,
      elements.inputAutoStepDelaySeconds,
    ].filter(Boolean).forEach((input) => {
      input.addEventListener('input', () => {
        markSettingsDirty(true);
        scheduleSettingsAutoSave();
      });
      input.addEventListener('change', () => {
        updatePlusModeUI();
        markSettingsDirty(true);
        scheduleSettingsAutoSave();
      });
    });
    elements.btnSaveSettings?.addEventListener('click', () => saveSettings({ silent: false, force: true }).catch(() => {}));
  }

  function bindRuntimeActions() {
    bindAutoRunClickHandler();
    elements.pageRecoveryCard?.addEventListener('click', async (event) => {
      const button = event.target?.closest?.('.page-recovery-btn');
      if (!button) return;
      try {
        button.disabled = true;
        if (button.dataset.recoveryAction === 'refresh') {
          await refreshPageRecoveryState();
          return;
        }
        const response = await sendSidepanelMessage({
          type: 'RESUME_FROM_PAGE',
          source: 'sidepanel',
          payload: {
            pageId: String(button.dataset.pageId || '').trim(),
            suggestionKind: String(button.dataset.recoveryKind || '').trim(),
          },
        });
        if (response?.error) throw new Error(response.error);
        await refreshPageRecoveryState();
      } catch (error) {
        showToast(error.message, 'error');
      } finally {
        button.disabled = false;
      }
    });
    stepsList?.addEventListener('click', async (event) => {
      const button = event.target?.closest?.('.step-btn');
      if (!button) return;
      const nodeId = String(button.dataset.nodeId || '').trim();
      if (!nodeId) return;
      try {
        ensureManualNodeSettingsReady(nodeId);
        await waitForSettingsSaveIdle();
        await saveSettings({ silent: true, force: true });
        button.disabled = true;
        const response = await sendSidepanelMessage({
          type: 'EXECUTE_NODE',
          source: 'sidepanel',
          payload: {
            nodeId,
            existingAccountJson: getExistingAccountJsonInputValue(),
          },
        });
        if (response?.error) throw new Error(response.error);
      } catch (error) {
        showToast(error.message, 'error');
      } finally {
        updateButtonStates();
      }
    });
    elements.btnStop?.addEventListener('click', async () => {
      elements.btnStop.disabled = true;
      await chrome.runtime.sendMessage({ type: 'STOP_FLOW', source: 'sidepanel', payload: {} }).catch((error) => {
        showToast(error.message, 'error');
      });
    });
    elements.btnReset?.addEventListener('click', async () => {
      const confirmed = await openConfirmModal({
        title: '重置流程',
        message: '确认重置全部步骤和数据吗？',
        confirmLabel: '确认重置',
        confirmVariant: 'btn-danger',
      });
      if (!confirmed) return;
      await chrome.runtime.sendMessage({ type: 'RESET', source: 'sidepanel' });
      latestState = {};
      renderLogs([]);
      renderStepsList();
      setStatus('就绪');
    });
    elements.btnClearLog?.addEventListener('click', () => renderLogs([]));
    elements.btnAutoContinue?.addEventListener('click', async () => {
      await sendSidepanelMessage({ type: 'RESUME_AUTO_RUN', source: 'sidepanel', payload: { existingAccountJson: getExistingAccountJsonInputValue() } });
      setDisplay(elements.autoContinueBar, false);
    });
    elements.btnAutoRunNow?.addEventListener('click', async () => {
      const waitingInterval = currentAutoRun.phase === 'waiting_interval';
      await sendSidepanelMessage({
        type: waitingInterval ? 'SKIP_AUTO_RUN_COUNTDOWN' : 'START_SCHEDULED_AUTO_RUN_NOW',
        source: 'sidepanel',
        payload: {},
      });
    });
    elements.btnAutoCancelSchedule?.addEventListener('click', async () => {
      await chrome.runtime.sendMessage({ type: 'CANCEL_SCHEDULED_AUTO_RUN', source: 'sidepanel', payload: {} });
    });
  }

  function bindToolActions() {
    elements.btnGpcHelperBalance?.addEventListener('click', async () => {
      try {
        elements.btnGpcHelperBalance.disabled = true;
        setText(elements.displayGpcHelperBalance, '查询中...');
        const response = await sendRuntimeMessageWithTimeout({
          type: 'REFRESH_GPC_CARD_BALANCE',
          source: 'sidepanel',
          payload: {
            apiUrl: normalizeUrl(elements.inputGpcHelperApi?.value || DEFAULT_GPC_HELPER_API_URL),
            apiKey: String(elements.inputGpcHelperCardKey?.value || '').trim(),
          },
        }, 20000, 'GPC 余额查询');
        if (response?.error) throw new Error(response.error);
        setText(elements.displayGpcHelperBalance, response?.balance || response?.message || '余额已更新');
      } catch (error) {
        setText(elements.displayGpcHelperBalance, `余额查询失败：${error.message}`);
        showToast(error.message, 'error');
      } finally {
        elements.btnGpcHelperBalance.disabled = false;
      }
    });
    elements.btnPlusCheckoutConversionProxyTest?.addEventListener('click', async () => {
      try {
        const proxyUrl = normalizeUrl(elements.inputPlusCheckoutConversionProxy?.value);
        if (!proxyUrl) throw new Error('请先填写支付转换代理地址。');
        setText(elements.displayPlusCheckoutConversionProxyTestResult, '测试中...');
        const response = await sendRuntimeMessageWithTimeout({
          type: 'TEST_PLUS_CHECKOUT_CONVERSION_PROXY',
          source: 'sidepanel',
          payload: { proxyUrl },
        }, 45000, '支付转换代理测试');
        if (response?.error) throw new Error(response.error);
        setText(elements.displayPlusCheckoutConversionProxyTestResult, response.exitIp ? `可用: ${response.exitIp}` : '可用');
      } catch (error) {
        setText(elements.displayPlusCheckoutConversionProxyTestResult, '测试失败');
        showToast(error.message, 'error');
      }
    });
    elements.btnHostedCheckoutManualFetch?.addEventListener('click', async () => {
      try {
        setText(elements.displayHostedCheckoutManualCode, '获取中...');
        const response = await sendRuntimeMessageWithTimeout({
          type: 'FETCH_HOSTED_CHECKOUT_VERIFICATION_CODE',
          source: 'sidepanel',
          payload: { verificationUrl: normalizeUrl(elements.inputHostedCheckoutVerificationUrl?.value) },
        }, 20000, '手动获取验证码');
        if (response?.error) throw new Error(response.error);
        const code = String(response?.code || '').trim();
        if (!code) throw new Error('未返回有效验证码。');
        setText(elements.displayHostedCheckoutManualCode, code);
      } catch (error) {
        setText(elements.displayHostedCheckoutManualCode, '获取失败');
        showToast(error.message, 'error');
      }
    });
    elements.btnAutoStartCancel?.addEventListener('click', () => closeConfirmModal(false));
    elements.btnAutoStartClose?.addEventListener('click', () => closeConfirmModal(false));
    elements.btnAutoStartContinue?.addEventListener('click', () => closeConfirmModal(true));
    elements.autoStartModal?.addEventListener('click', (event) => {
      if (event.target === elements.autoStartModal) closeConfirmModal(false);
    });
  }

  function bindMessages() {
    chrome.runtime.onMessage.addListener((message) => {
      if (!message || typeof message !== 'object') return;
      switch (message.type) {
        case 'LOG_ENTRY':
          appendLog(message.payload || {});
          break;
        case 'NODE_STATUS_CHANGED':
          syncLatestState({
            nodeStatuses: {
              ...(latestState.nodeStatuses || {}),
              [message.payload?.nodeId]: message.payload?.status,
            },
          });
          renderStepStatuses(latestState);
          refreshPageRecoveryState().catch(() => {});
          break;
        case 'AUTO_RUN_RESET':
          syncLatestState({ nodeStatuses: {} });
          renderLogs([]);
          renderStepStatuses(latestState);
          refreshPageRecoveryState().catch(() => {});
          applyAutoRunStatus({ autoRunning: false, autoRunPhase: 'idle' });
          break;
        case 'DATA_UPDATED':
          applySettingsState({ ...latestState, ...(message.payload || {}) });
          refreshPageRecoveryState().catch(() => {});
          resolveManualConfirmation({ ...latestState, ...(message.payload || {}) }).catch((error) => showToast(error.message, 'error'));
          break;
        case 'AUTO_RUN_STATUS':
          applyAutoRunStatus(message.payload || {});
          break;
        case 'SECURITY_BLOCKED_ALERT':
          showToast(message.payload?.message || '检测到安全拦截。', 'warn', 5000);
          break;
        case 'REQUEST_GOPAY_OTP_INPUT':
        case 'REQUEST_CUSTOM_VERIFICATION_BYPASS_CONFIRMATION':
          syncLatestState(message.payload || {});
          resolveManualConfirmation(latestState).catch((error) => showToast(error.message, 'error'));
          break;
        default:
          break;
      }
    });
  }

  function initTheme() {
    const stored = localStorage.getItem('sidepanel-theme') || '';
    if (stored) {
      document.documentElement.dataset.theme = stored;
    }
    elements.btnTheme?.addEventListener('click', () => {
      const nextTheme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = nextTheme;
      localStorage.setItem('sidepanel-theme', nextTheme);
    });
  }

  function init() {
    bindPasswordVisibilityToggles();
    bindHostedSmsPoolControls();
    bindSettingsInputs();
    bindRuntimeActions();
    bindToolActions();
    bindMessages();
    initTheme();
    initAccountRecordsManager();
    updatePlusModeUI();
    updateSaveButtonState();
    initializeReleaseInfo().catch((error) => console.warn('初始化更新信息失败：', error));
    restoreState().catch((error) => {
      console.error('初始化侧栏状态失败：', error);
      showToast(`初始化侧栏状态失败：${error.message}`, 'error');
    });
  }

  init();
})();
