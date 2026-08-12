import { Sparkles } from 'lucide-react';
import { figmaVoiceAiTranscribeBtn } from './figmaVoiceClasses';
import { hasBackendCapability } from '../../config/backendCapabilities';
import { useAppStrings } from '../../locales/appStrings';

const VOICE_TRANSCRIPT_ENABLED = hasBackendCapability('voiceTranscriptMinutes');

export default function VoiceAiTranscribeControl({
  active = false,
  onToggle,
  idleLabel,
  activeLabel,
  title,
}) {
  const { t } = useAppStrings();

  if (!VOICE_TRANSCRIPT_ENABLED) return null;

  const resolvedIdleLabel = idleLabel ?? t('voiceRoom.aiTranscribeIdle');
  const resolvedActiveLabel = activeLabel ?? t('voiceRoom.aiTranscribeActive');
  const resolvedTitle = title ?? t('voiceRoom.aiTranscribeTitle');

  return (
    <div className="inline-flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={onToggle}
        title={resolvedTitle}
        className={figmaVoiceAiTranscribeBtn(active)}
      >
        <Sparkles className="h-3.5 w-3.5" aria-hidden />
        {active ? resolvedActiveLabel : resolvedIdleLabel}
      </button>
    </div>
  );
}
