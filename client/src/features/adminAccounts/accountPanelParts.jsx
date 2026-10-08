import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Copy, Eye, EyeOff } from 'lucide-react';
import { adminPrimaryBtnClass } from '../../components/adminUsers/adminUserPanelUi';
import { adminUserAPI } from '../../services/api/adminUserAPI';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { unwrapApi } from '../../utils/adminUserUtils';

const ICON_BTN_CLASS =
  'inline-flex shrink-0 items-center justify-center rounded-md p-1.5 text-primary transition-colors duration-150 hover:bg-primary-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none';

export const accountInfoCardClass = () => 'rounded-xl border border-border bg-muted px-3 py-3';

export function unwrapSummary(res) {
  return unwrapApi(res)?.data ?? unwrapApi(res);
}

/** Tải auth summary của user đích; tự hủy khi đổi user/org. */
export function useAccountAuthSummary(orgId, userId, fallbackKey) {
  const { t } = useAppStrings();
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    if (!orgId || !userId) {
      setSummary(null);
      setLoadError('');
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError('');
    adminUserAPI
      .getAuthSummary(orgId, userId)
      .then((res) => {
        if (!cancelled) setSummary(unwrapSummary(res) || null);
      })
      .catch((error) => {
        if (cancelled) return;
        setSummary(null);
        setLoadError(resolveApiErrorMessage(error, { t, fallback: t(fallbackKey) }));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId, userId, t, fallbackKey, reloadTick]);

  const reload = useCallback(() => setReloadTick((n) => n + 1), []);

  return { summary, setSummary, loading, loadError, reload };
}

export function AccountLoadError({ message, onRetry, disabled = false }) {
  const { t } = useAppStrings();
  return (
    <div className="mb-4 space-y-3">
      <p role="alert" className="rounded-xl border border-destructive bg-card px-3 py-2 text-sm text-destructive">
        {message}
      </p>
      <button type="button" className={adminPrimaryBtnClass()} disabled={disabled} onClick={onRetry}>
        {t('adminRbac.retry')}
      </button>
    </div>
  );
}

export function AccountStatusPill({ tone = 'muted', children }) {
  const toneClass =
    tone === 'success'
      ? 'bg-success-bg text-success'
      : tone === 'warning'
        ? 'bg-warning-bg text-warning'
        : tone === 'danger'
          ? 'bg-card text-destructive ring-1 ring-destructive'
          : 'bg-muted text-muted-foreground';
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${toneClass}`}>{children}</span>
  );
}

export async function copyToClipboard(value, label, t) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(t('oneTimeCredentials.copied', { label }));
  } catch {
    toast.error(t('oneTimeCredentials.copyFail'));
  }
}

/** Dòng giá trị nhạy cảm: che mặc định (khi `secret`), có nút hiện/ẩn và sao chép. */
export function SensitiveValueRow({ label, value, secret = false }) {
  const { t } = useAppStrings();
  const [revealed, setRevealed] = useState(false);
  const shown = !secret || revealed ? value : '•'.repeat(Math.min(Math.max(value.length, 8), 16));
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <code className="break-all font-semibold text-foreground">{shown}</code>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {secret ? (
          <button
            type="button"
            className={ICON_BTN_CLASS}
            aria-pressed={revealed}
            aria-label={revealed ? t('adminAccounts.hideValue', { label }) : t('adminAccounts.showValue', { label })}
            onClick={() => setRevealed((v) => !v)}
          >
            {revealed ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
          </button>
        ) : null}
        <button
          type="button"
          className={ICON_BTN_CLASS}
          aria-label={t('adminAccounts.copyValue', { label })}
          onClick={() => copyToClipboard(value, label, t)}
        >
          <Copy size={16} aria-hidden />
        </button>
      </div>
    </div>
  );
}

/** Link dev (reset/verify) — chỉ hiện khi BE trả về ở môi trường dev. */
export function DevLinkNotice({ label, url }) {
  const { t } = useAppStrings();
  if (!url) return null;
  return (
    <div className="mt-4 space-y-2 rounded-xl border border-warning bg-warning-bg p-3">
      <p className="text-xs font-semibold text-warning">{t('adminAccounts.devLinkWarning')}</p>
      <SensitiveValueRow label={label} value={String(url)} />
    </div>
  );
}
