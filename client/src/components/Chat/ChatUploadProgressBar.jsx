/**
 * Thanh tiến trình khi đang upload file/ảnh lên Storage (signed URL + POST tin).
 */
import { useAppStrings } from '../../locales/appStrings';

export default function ChatUploadProgressBar({ percent, label }) {
  const { t } = useAppStrings();
  if (percent == null) return null;
  const finalLabel = label ?? t('friendChat.uploadLabel');
  const p = Math.min(100, Math.max(0, Number(percent) || 0));
  return (
    <div className="border-b border-border bg-surface px-3 py-2">
      <div className="mb-1 flex items-center justify-between text-xs text-foreground-secondary">
        <span>{finalLabel}</span>
        <span className="tabular-nums font-medium text-foreground">{Math.round(p)}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-gradient-to-r from-primary to-primary-hover transition-[width] duration-150 ease-out"
          style={{ width: `${p}%` }}
        />
      </div>
    </div>
  );
}
