import { Check, X } from 'lucide-react';
import { useAppStrings } from '../../locales/appStrings';

export default function VoiceFeatureApprovalBanner({
  isHost = false,
  pendingRequests = [],
  grantedFeatures = [],
  onResolve,
  onRequestFeature,
}) {
  const { t } = useAppStrings();

  if (isHost && pendingRequests.length > 0) {
    return (
      <div className="mb-3 space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
        <p className="text-xs font-medium text-foreground">{t('voiceRoom.featureApprovalHostTitle')}</p>
        {pendingRequests.map((req) => (
          <div key={req.id} className="flex items-center justify-between gap-2 text-xs">
            <span className="truncate text-muted-foreground">
              {req.displayName || req.userId} —{' '}
              {req.type === 'ai_summary'
                ? t('voiceRoom.aiTranscribeIdle')
                : t('voiceRoom.recordMeeting')}
            </span>
            <span className="flex shrink-0 gap-1">
              <button
                type="button"
                className="rounded p-1 hover:bg-emerald-500/20"
                title={t('voiceRoom.approve')}
                onClick={() => onResolve?.(req.id, true)}
              >
                <Check className="h-3.5 w-3.5 text-emerald-600" />
              </button>
              <button
                type="button"
                className="rounded p-1 hover:bg-destructive/20"
                title={t('voiceRoom.reject')}
                onClick={() => onResolve?.(req.id, false)}
              >
                <X className="h-3.5 w-3.5 text-destructive" />
              </button>
            </span>
          </div>
        ))}
      </div>
    );
  }

  if (!isHost) {
    const needsRecording = !grantedFeatures.includes('recording');
    const needsSummary = !grantedFeatures.includes('ai_summary');
    if (!needsRecording && !needsSummary) return null;

    return (
      <div className="mb-3 flex flex-wrap gap-2">
        {needsRecording ? (
          <button
            type="button"
            className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted/50"
            onClick={() => onRequestFeature?.('recording')}
          >
            {t('voiceRoom.requestRecordingPermission')}
          </button>
        ) : null}
        {needsSummary ? (
          <button
            type="button"
            className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted/50"
            onClick={() => onRequestFeature?.('ai_summary')}
          >
            {t('voiceRoom.requestSummaryPermission')}
          </button>
        ) : null}
      </div>
    );
  }

  return null;
}
