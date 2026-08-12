import { useAppStrings } from '../../locales/appStrings';

export default function VoiceLiveTranscriptPanel({ lines = [], className = '' }) {
  const { t } = useAppStrings();
  if (!lines.length) return null;

  return (
    <div
      className={`rounded-lg border border-border bg-card/80 p-3 ${className}`.trim()}
      aria-live="polite"
    >
      <p className="mb-2 text-xs font-medium text-foreground">{t('voiceRoom.liveTranscriptTitle')}</p>
      <div className="max-h-40 space-y-1 overflow-y-auto text-xs text-muted-foreground">
        {lines.map((line) => (
          <p key={`${line.seq}-${line.at || ''}`}>
            {line.displayName ? (
              <span className="font-medium text-foreground/80">{line.displayName}: </span>
            ) : null}
            {line.text}
          </p>
        ))}
      </div>
    </div>
  );
}
