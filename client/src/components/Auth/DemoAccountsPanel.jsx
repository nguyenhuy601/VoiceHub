import { useState } from 'react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { DEMO_ACCOUNTS, DEMO_ACCOUNT_PASSWORD, isDemoAccountsEnabled } from '../../config/demoAccounts';
import { useAuth } from '../../context/AuthContext';
import { ensureDemoAccountProvisioned } from '../../utils/demoAccountAuth';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { useAppStrings } from '../../locales/appStrings';

export default function DemoAccountsPanel({ disabled = false, className = '' }) {
  const { login } = useAuth();
  const navigate = useNavigate();
  const { t } = useAppStrings();
  const [busyEmail, setBusyEmail] = useState(null);

  if (!isDemoAccountsEnabled()) return null;

  const handleDemoLogin = async (acc) => {
    if (disabled || busyEmail) return;
    setBusyEmail(acc.email);
    try {
      await ensureDemoAccountProvisioned(acc.email);
      const ok = await login(acc.email, DEMO_ACCOUNT_PASSWORD);
      if (ok) {
        toast.success(t('auth.demoLoginSuccess', { role: acc.roleLabel }));
        navigate('/app', { replace: true });
      }
    } catch (err) {
      toast.error(resolveApiErrorMessage(err, t('auth.demoLoginFailed')));
    } finally {
      setBusyEmail(null);
    }
  };

  return (
    <div className={`mt-4 overflow-hidden rounded-[10px] border border-white/[0.08] bg-[#0B0B16]/80 ${className}`}>
      <div className="flex items-center justify-between border-b border-white/[0.06] bg-primary/10 px-3 py-2">
        <span className="text-[0.65rem] font-bold uppercase tracking-[0.08em] text-primary">
          {t('auth.demoAccountsTitle')}
        </span>
        <span className="text-[0.6rem] text-muted-foreground/80">{t('auth.demoAccountsHint')}</span>
      </div>
      {DEMO_ACCOUNTS.map((acc, i) => (
        <button
          key={acc.email}
          type="button"
          disabled={disabled || busyEmail === acc.email}
          onClick={() => handleDemoLogin(acc)}
          className="flex w-full items-center gap-2.5 border-b border-white/[0.05] bg-transparent px-3 py-2 text-left transition last:border-b-0 hover:bg-white/[0.04] disabled:opacity-60"
        >
          <div
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] text-[0.65rem] font-bold"
            style={{ background: `${acc.color}18`, color: acc.color }}
          >
            {acc.name.charAt(0)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[0.8125rem] font-semibold text-foreground">
              {acc.name}
            </div>
            <div className="truncate text-[0.6875rem] text-muted-foreground">
              {acc.email} · {acc.desc}
            </div>
          </div>
          <span
            className="shrink-0 rounded px-1.5 py-px text-[0.5625rem] font-bold"
            style={{ background: `${acc.color}18`, color: acc.color }}
          >
            {acc.roleLabel}
          </span>
        </button>
      ))}
    </div>
  );
}
