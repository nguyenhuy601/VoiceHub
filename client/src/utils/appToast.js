/**
 * Wrapper react-hot-toast — cùng theme với <Toaster> trong main.jsx.
 * Dùng notify.* khi muốn gộp duration/style mặc định; vẫn có thể import toast trực tiếp.
 */
import toast from 'react-hot-toast';

const base = { duration: 3400 };

export const notify = {
  success: (message, opts) => toast.success(message, { duration: 3000, ...opts }),
  error: (message, opts) => toast.error(message, { duration: 4200, ...opts }),
  info: (message, opts) =>
    toast(message, {
      ...base,
      ...opts,
    }),
  loading: (message, opts) => toast.loading(message, { ...base, ...opts }),
  dismiss: (id) => toast.dismiss(id),
};

export default notify;
