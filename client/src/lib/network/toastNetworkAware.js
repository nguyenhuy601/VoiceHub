/** Deduped toast while OFFLINE so poll storms do not spam. */
let lastOfflineToastAt = 0;
const OFFLINE_TOAST_COOLDOWN_MS = 8_000;

/**
 * @param {import('react-hot-toast').default} toast
 * @param {string} message
 * @param {object} networkController
 */
export function toastNetworkAware(toast, message, networkController) {
  if (networkController?.shouldBlockRequests?.()) {
    const now = Date.now();
    if (now - lastOfflineToastAt < OFFLINE_TOAST_COOLDOWN_MS) return;
    lastOfflineToastAt = now;
    toast.error(message, { id: 'network-offline', duration: 4000 });
    return;
  }
  toast.error(message);
}

export function resetOfflineToastCooldown() {
  lastOfflineToastAt = 0;
}
