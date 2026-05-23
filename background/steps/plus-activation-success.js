(function attachBackgroundPlusActivationSuccess(root, factory) {
  root.MultiPageBackgroundPlusActivationSuccess = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createBackgroundPlusActivationSuccessModule() {
  const PLUS_ACTIVATION_SUCCESS_NODE_ID = 'plus-activation-success';
  const PLUS_ACTIVATION_SUCCESS_MESSAGE = 'Plus 开通成功';

  function createPlusActivationSuccessExecutor(deps = {}) {
    const {
      addLog,
      completeNodeFromBackground,
      setState,
    } = deps;

    async function executePlusActivationSuccess() {
      const activatedAt = Date.now();
      const payload = {
        plusActivationStatus: 'success',
        plusActivatedAt: activatedAt,
        plusActivationMessage: PLUS_ACTIVATION_SUCCESS_MESSAGE,
      };

      await setState(payload);
      await addLog(PLUS_ACTIVATION_SUCCESS_MESSAGE, 'ok', { nodeId: PLUS_ACTIVATION_SUCCESS_NODE_ID });
      await completeNodeFromBackground(PLUS_ACTIVATION_SUCCESS_NODE_ID, payload);
    }

    return {
      executePlusActivationSuccess,
    };
  }

  return {
    createPlusActivationSuccessExecutor,
  };
});
