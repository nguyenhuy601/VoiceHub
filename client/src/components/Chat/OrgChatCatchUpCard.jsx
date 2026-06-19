import { useMemo } from 'react';
import { Sparkles, X } from 'lucide-react';
import { hasBackendCapability } from '../../config/backendCapabilities';
import { useAppStrings } from '../../locales/appStrings';

const AI_CHANNEL_CATCHUP_ENABLED = hasBackendCapability('aiChannelCatchupSummary');

function buildHeuristicSummary({ unreadCount = 0, channelName = '', t }) {
  const count = Math.max(0, Number(unreadCount) || 0);
  const ch = String(channelName || '').trim();

  if (count === 0) {
    return t('chat.unreadCatchupSummaryZero');
  }

  if (count >= 50) {
    return t('chat.unreadCatchupSummaryHigh', { count, channelName: ch });
  }

  if (count >= 10) {
    return t('chat.unreadCatchupSummaryMedium', { count, channelName: ch });
  }

  return t('chat.unreadCatchupSummaryLow', { count, channelName: ch });
}

/**
 * Coral AI catch-up card — heuristic summary từ unreadCount (UI-only, chưa gọi BE).
 */
export default function OrgChatCatchUpCard({
  unreadCount = 0,
  channelName = '',
  onDismiss,
  onViewDetails,
  className = '',
}) {
  const { t } = useAppStrings();
  const summary = useMemo(
    () => buildHeuristicSummary({ unreadCount, channelName, t }),
    [unreadCount, channelName, t]
  );
  const count = Math.max(0, Number(unreadCount) || 0);

  if (count === 0) return null;

  return (
    <div
      className={`mx-4 mb-3 rounded-xl border border-ai/25 bg-gradient-to-br from-ai-subtle via-surface to-warning/5 p-3.5 shadow-sm ${className}`}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-ai to-warning text-white shadow-sm">
          <Sparkles size={14} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <span className="text-[0.65rem] font-bold uppercase tracking-wider text-ai">
              {AI_CHANNEL_CATCHUP_ENABLED ? t('chat.aiCatchup') : t('chat.unreadCatchup')}
            </span>
            <span className="rounded-full bg-ai/15 px-2 py-0.5 text-[0.625rem] font-bold text-ai">
              {t('chat.unreadCountLabel', { count })}
            </span>
          </div>
          <p className="text-sm leading-relaxed text-foreground">{summary}</p>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onViewDetails?.()}
              className="rounded-lg bg-ai px-3 py-1.5 text-xs font-semibold text-ai-foreground transition hover:bg-ai-hover"
            >
              {t('chat.viewDetails')}
            </button>
            <button
              type="button"
              onClick={() => onDismiss?.()}
              className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              {t('chat.dismiss')}
            </button>
          </div>
        </div>
        <button
          type="button"
          title={t('chat.close')}
          aria-label={t('chat.close')}
          onClick={() => onDismiss?.()}
          className="shrink-0 rounded-md p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
