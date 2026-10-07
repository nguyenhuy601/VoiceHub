import { Inbox, Loader2 } from 'lucide-react';
import { useAppStrings } from '../../locales/appStrings';
import { adminPrimaryBtnClass } from './adminUserPanelUi';

/** Skeleton tải lần đầu: list/bảng 5 dòng, form/picker 3 khối (RULE-UI-04). */
export function AdminListSkeleton({ rows = 5, className = '' }) {
  const { t } = useAppStrings();
  return (
    <div className={`space-y-2 ${className}`.trim()} role="status" aria-live="polite">
      <span className="sr-only">{t('common.loading')}</span>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="h-10 rounded-lg bg-muted motion-safe:animate-pulse" aria-hidden />
      ))}
    </div>
  );
}

export function AdminLoadErrorState({ message, onRetry, disabled = false, className = '' }) {
  const { t } = useAppStrings();
  return (
    <div className={`space-y-3 ${className}`.trim()}>
      <p role="alert" className="rounded-xl border border-destructive bg-card px-3 py-2 text-sm text-destructive">
        {message}
      </p>
      {onRetry ? (
        <button type="button" className={adminPrimaryBtnClass()} disabled={disabled} onClick={onRetry}>
          {t('adminRbac.retry')}
        </button>
      ) : null}
    </div>
  );
}

export function AdminEmptyState({ message, action = null, className = '' }) {
  return (
    <div className={`flex flex-col items-center gap-2 px-4 py-8 text-center ${className}`.trim()}>
      <Inbox size={28} className="text-muted-foreground" aria-hidden />
      <p className="text-sm text-muted-foreground">{message}</p>
      {action}
    </div>
  );
}

/** Spinner nhỏ trong nút bận (giữ chiều rộng nút nhờ gap của ADMIN_BTN_BASE). */
export function AdminBusySpinner({ busy }) {
  if (!busy) return null;
  return <Loader2 size={14} className="motion-safe:animate-spin" aria-hidden />;
}
