import { Modal } from '../Shared';
import { useAppStrings } from '../../locales/appStrings';
import { Loader2, ListChecks, Sparkles } from 'lucide-react';

export default function ConversationSummaryModal({
  isOpen,
  onClose,
  phase = 'idle',
  summary = null,
  error = '',
  channelName = '',
}) {
  const { t } = useAppStrings();
  const result = summary?.result || {};
  const loading = phase === 'loading';
  const failed = phase === 'failed';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('chat.summaryModalTitle')}
      size="lg"
    >
      <div className="space-y-4">
        {channelName ? (
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {channelName}
          </p>
        ) : null}

        {loading ? (
          <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 shrink-0 animate-spin text-ai" />
            <span>{t('chat.summaryGenerating')}</span>
          </div>
        ) : null}

        {failed ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {error || t('chat.summaryFailed')}
          </div>
        ) : null}

        {phase === 'ready' && result?.overview ? (
          <div className="space-y-4">
            <section>
              <div className="mb-2 flex items-center gap-2 text-ai">
                <Sparkles size={16} />
                <h3 className="text-sm font-semibold">{t('chat.summaryOverview')}</h3>
              </div>
              <p className="text-sm leading-relaxed text-foreground">{result.overview}</p>
            </section>

            {Array.isArray(result.keyPoints) && result.keyPoints.length > 0 ? (
              <section>
                <h3 className="mb-2 text-sm font-semibold text-foreground">{t('chat.summaryKeyPoints')}</h3>
                <ul className="list-disc space-y-1 pl-5 text-sm text-foreground">
                  {result.keyPoints.map((point, idx) => (
                    <li key={`kp-${idx}`}>{point}</li>
                  ))}
                </ul>
              </section>
            ) : null}

            {Array.isArray(result.actionItems) && result.actionItems.length > 0 ? (
              <section>
                <div className="mb-2 flex items-center gap-2">
                  <ListChecks size={16} className="text-ai" />
                  <h3 className="text-sm font-semibold text-foreground">{t('chat.summaryActionItems')}</h3>
                </div>
                <ul className="space-y-2">
                  {result.actionItems.map((item, idx) => (
                    <li
                      key={`ai-${idx}`}
                      className="rounded-lg border border-border bg-surface px-3 py-2 text-sm"
                    >
                      <p className="font-medium text-foreground">{item.title}</p>
                      {(item.assigneeHint || item.dueDateHint) && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {[item.assigneeHint, item.dueDateHint].filter(Boolean).join(' · ')}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
