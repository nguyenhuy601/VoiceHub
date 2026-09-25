/**
 * Wrapper react-hot-toast — cùng theme với <VoiceHubToaster /> trong main.jsx.
 * Dùng notify.* khi muốn gộp duration/style mặc định; vẫn có thể import toast trực tiếp.
 */
import toast from 'react-hot-toast';

/** Shared with VoiceHubToaster toastOptions — keep in sync. */
export const TOAST_DURATION = Object.freeze({
  default: 3400,
  success: 3000,
  error: 4200,
});

export const notify = {
  success: (message, opts) =>
    toast.success(message, { duration: TOAST_DURATION.success, ...opts }),
  error: (message, opts) =>
    toast.error(message, { duration: TOAST_DURATION.error, ...opts }),
  info: (message, opts) =>
    toast(message, {
      duration: TOAST_DURATION.default,
      ...opts,
    }),
  loading: (message, opts) =>
    toast.loading(message, { duration: TOAST_DURATION.default, ...opts }),
  dismiss: (id) => toast.dismiss(id),
};

export default notify;
