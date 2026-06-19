import { Hash, Mic, Plus } from 'lucide-react';
import {
  FIGMA_VOICE_LOBBY_BODY,
  FIGMA_VOICE_LOBBY_CREATE_CARD,
  FIGMA_VOICE_LOBBY_CREATE_ICON,
  FIGMA_VOICE_LOBBY_FEATURE_CHIP,
  FIGMA_VOICE_LOBBY_HEADER,
  FIGMA_VOICE_LOBBY_HEADER_ICON,
  FIGMA_VOICE_LOBBY_HEADER_TITLE,
  FIGMA_VOICE_LOBBY_HERO_GRID,
  FIGMA_VOICE_LOBBY_JOIN_CARD,
  FIGMA_VOICE_LOBBY_JOIN_ICON,
  FIGMA_VOICE_LOBBY_JOIN_INPUT,
  FIGMA_VOICE_LOBBY_LIVE_BADGE,
  FIGMA_VOICE_LOBBY_LIVE_DOT,
  FIGMA_VOICE_LOBBY_LIVE_TEXT,
  FIGMA_VOICE_LOBBY_PRIMARY_BTN,
  FIGMA_VOICE_LOBBY_ROOT,
  figmaVoiceLobbyJoinBtn,
} from './figmaVoiceClasses';
import VoiceActiveRoomsList from './VoiceActiveRoomsList';
import { hasBackendCapability } from '../../config/backendCapabilities';
import { useAppStrings } from '../../locales/appStrings';

const VOICE_TRANSCRIPT_ENABLED = hasBackendCapability('voiceTranscriptMinutes');
const DEFAULT_FEATURES = [
  'HD 720p',
  ...(VOICE_TRANSCRIPT_ENABLED ? ['AI Transcribe'] : []),
];

export default function VoiceLobbyView({
  title,
  liveRoomsCount = 0,
  liveRoomsLabel,
  roomCode = '',
  onRoomCodeChange,
  onCreateRoom,
  onJoinByCode,
  rooms = [],
  onJoinRoom,
  createTitle,
  createDescription,
  createButtonLabel,
  joinTitle,
  joinDescription,
  joinFieldLabel,
  joinButtonLabel,
  joinHint,
  features = DEFAULT_FEATURES,
}) {
  const { t } = useAppStrings();
  const trimmedCode = String(roomCode || '').trim();
  const resolvedTitle = title ?? t('voiceRoom.pageTitle');
  const resolvedCreateTitle = createTitle ?? t('voiceRoom.lobbyCreateTitle');
  const resolvedCreateDescription = createDescription ?? t('voiceRoom.createDescription');
  const resolvedCreateButtonLabel = createButtonLabel ?? t('voiceRoom.lobbyCreateBtn');
  const resolvedJoinTitle = joinTitle ?? t('voiceRoom.lobbyJoinTitle');
  const resolvedJoinDescription = joinDescription ?? t('voiceRoom.lobbyJoinDesc');
  const resolvedJoinFieldLabel = joinFieldLabel ?? t('voiceRoom.lobbyJoinField');
  const resolvedJoinButtonLabel = joinButtonLabel ?? t('voiceRoom.joinNav');
  const resolvedJoinHint = joinHint ?? t('voiceRoom.joinHint');
  const liveLabel =
    liveRoomsLabel ||
    (liveRoomsCount > 0
      ? t('voiceRoom.liveRoomsCount', { n: liveRoomsCount })
      : t('voiceRoom.liveRoomsEmpty'));

  return (
    <div className={FIGMA_VOICE_LOBBY_ROOT}>
      <header className={FIGMA_VOICE_LOBBY_HEADER}>
        <div className={FIGMA_VOICE_LOBBY_HEADER_ICON}>
          <Mic className="h-3.5 w-3.5 text-warning" aria-hidden />
        </div>
        <h4 className={FIGMA_VOICE_LOBBY_HEADER_TITLE}>{resolvedTitle}</h4>
        <div className={FIGMA_VOICE_LOBBY_LIVE_BADGE}>
          <span className={FIGMA_VOICE_LOBBY_LIVE_DOT} />
          <span className={FIGMA_VOICE_LOBBY_LIVE_TEXT}>{liveLabel}</span>
        </div>
      </header>

      <div className={FIGMA_VOICE_LOBBY_BODY}>
        <div className={FIGMA_VOICE_LOBBY_HERO_GRID}>
          <div className={FIGMA_VOICE_LOBBY_CREATE_CARD}>
            <div className={FIGMA_VOICE_LOBBY_CREATE_ICON}>
              <Plus className="h-[22px] w-[22px] text-primary-foreground" aria-hidden />
            </div>
            <h3 className="mb-2 text-base font-semibold text-foreground">{resolvedCreateTitle}</h3>
            <p className="mb-5 text-sm leading-relaxed text-muted-foreground">{resolvedCreateDescription}</p>
            <div className="mb-[18px] flex flex-wrap gap-2.5">
              {features.map((feature) => (
                <span key={feature} className={FIGMA_VOICE_LOBBY_FEATURE_CHIP}>
                  {feature}
                </span>
              ))}
            </div>
            <button type="button" onClick={onCreateRoom} className={FIGMA_VOICE_LOBBY_PRIMARY_BTN}>
              {resolvedCreateButtonLabel}
            </button>
          </div>

          <div className={FIGMA_VOICE_LOBBY_JOIN_CARD}>
            <div className={FIGMA_VOICE_LOBBY_JOIN_ICON}>
              <Hash className="h-[18px] w-[18px] text-primary" aria-hidden />
            </div>
            <h3 className="mb-2 text-base font-semibold text-foreground">{resolvedJoinTitle}</h3>
            <p className="mb-4 text-sm leading-relaxed text-muted-foreground">{resolvedJoinDescription}</p>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              {resolvedJoinFieldLabel}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={roomCode}
                onChange={(e) => onRoomCodeChange?.(e.target.value)}
                placeholder="VH-XXXXXX"
                className={FIGMA_VOICE_LOBBY_JOIN_INPUT}
              />
              <button
                type="button"
                disabled={!trimmedCode}
                onClick={() => onJoinByCode?.(trimmedCode)}
                className={figmaVoiceLobbyJoinBtn(Boolean(trimmedCode))}
              >
                {resolvedJoinButtonLabel}
              </button>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">{resolvedJoinHint}</p>
          </div>
        </div>

        <VoiceActiveRoomsList rooms={rooms} onJoinRoom={onJoinRoom} />
      </div>
    </div>
  );
}
