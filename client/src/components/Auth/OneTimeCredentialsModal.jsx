import { useState } from 'react';
import { Copy, Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';
import { Modal, GradientButton } from '../Shared';
import { useAppStrings } from '../../locales/appStrings';
import { useTheme } from '../../context/ThemeContext';

export default function OneTimeCredentialsModal({ open, email, password, onClose }) {
  const { t } = useAppStrings();
  const { isDarkMode } = useTheme();
  const [showPassword, setShowPassword] = useState(true);

  if (!open || !email || !password) return null;

  const copy = async (value, label) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(t('oneTimeCredentials.copied', { label }));
    } catch {
      toast.error(t('oneTimeCredentials.copyFail'));
    }
  };

  const muted = isDarkMode ? 'text-slate-400' : 'text-slate-600';
  const box = isDarkMode
    ? 'rounded-lg border border-white/10 bg-black/30 px-3 py-2'
    : 'rounded-lg border border-slate-200 bg-slate-50 px-3 py-2';

  return (
    <Modal isOpen={open} onClose={onClose} title={t('oneTimeCredentials.title')} size="md">
      <div className="space-y-4">
        <p className={`text-sm leading-relaxed ${muted}`}>{t('oneTimeCredentials.onceWarning')}</p>
        <div className={box}>
          <div className={`mb-1 text-xs font-semibold uppercase tracking-wide ${muted}`}>
            {t('oneTimeCredentials.account')}
          </div>
          <div className="flex items-center justify-between gap-2">
            <code className="break-all text-sm font-semibold">{email}</code>
            <button
              type="button"
              className="shrink-0 rounded-md p-1.5 text-cyan-500 hover:bg-cyan-500/10"
              onClick={() => copy(email, t('oneTimeCredentials.account'))}
              aria-label={t('oneTimeCredentials.copy')}
            >
              <Copy size={16} />
            </button>
          </div>
        </div>
        <div className={box}>
          <div className={`mb-1 text-xs font-semibold uppercase tracking-wide ${muted}`}>
            {t('oneTimeCredentials.password')}
          </div>
          <div className="flex items-center justify-between gap-2">
            <code className="break-all text-sm font-semibold">
              {showPassword ? password : '••••••••••••'}
            </code>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                className="rounded-md p-1.5 text-cyan-500 hover:bg-cyan-500/10"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? t('login.hide') : t('login.show')}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
              <button
                type="button"
                className="rounded-md p-1.5 text-cyan-500 hover:bg-cyan-500/10"
                onClick={() => copy(password, t('oneTimeCredentials.password'))}
                aria-label={t('oneTimeCredentials.copy')}
              >
                <Copy size={16} />
              </button>
            </div>
          </div>
        </div>
        <p className={`text-xs ${muted}`}>{t('oneTimeCredentials.loginHint')}</p>
        <GradientButton type="button" className="w-full justify-center" onClick={onClose}>
          {t('oneTimeCredentials.understood')}
        </GradientButton>
      </div>
    </Modal>
  );
}
