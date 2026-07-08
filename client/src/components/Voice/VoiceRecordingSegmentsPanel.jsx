import { useAppStrings } from '../../locales/appStrings';
import { formatMeetingDuration } from '../../utils/voiceRecordingUtils';

export default function VoiceRecordingSegmentsPanel({
  segments = [],
  meetingId,
  onPlaySegment,
  activeSegmentId = null,
}) {
  const { t } = useAppStrings();
  if (!segments.length) return null;

  return (
    <div className="mb-3 space-y-2">
      <p className="text-xs font-medium text-foreground">{t('voiceRoom.recordingSegmentsTitle')}</p>
      <ul className="max-h-32 space-y-1 overflow-y-auto">
        {segments.map((seg) => (
          <li key={seg.id || seg.segmentIndex}>
            <button
              type="button"
              onClick={() => onPlaySegment?.(seg)}
              className={`flex w-full items-center justify-between rounded-md border px-2 py-1.5 text-left text-xs transition ${
                activeSegmentId === seg.id
                  ? 'border-primary bg-primary/10'
                  : 'border-border hover:bg-muted/50'
              }`}
            >
              <span>
                {t('voiceRoom.recordingSegmentLabel', { index: (seg.segmentIndex ?? 0) + 1 })}
              </span>
              <span className="text-muted-foreground">
                {formatMeetingDuration(seg.durationSec || 0)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
