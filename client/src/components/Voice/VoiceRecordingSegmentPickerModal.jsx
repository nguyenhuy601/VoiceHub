import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useAppStrings } from '../../locales/appStrings';
import VoiceRecordingSegmentsPanel from './VoiceRecordingSegmentsPanel';

export default function VoiceRecordingSegmentPickerModal({
  open = false,
  title = '',
  segments = [],
  onClose,
  onSelectSegment,
}) {
  const { t } = useAppStrings();

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[210] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t('voiceRoom.recordingSegmentPickerTitle')}
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground">
              {t('voiceRoom.recordingSegmentPickerTitle')}
            </h3>
            {title ? (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{title}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-muted-foreground hover:bg-muted"
            aria-label={t('voiceRoom.closeAria')}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">{t('voiceRoom.recordingSegmentPickerHint')}</p>
        <VoiceRecordingSegmentsPanel
          segments={segments}
          onPlaySegment={onSelectSegment}
        />
      </div>
    </div>,
    document.body
  );
}
