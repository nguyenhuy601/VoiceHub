import { useState } from 'react';
import { MicOff } from 'lucide-react';
import UserAvatar from '../Shared/UserAvatar';
import VoiceSpeakingWaveform from './VoiceSpeakingWaveform';
import { voiceParticipantColor, voiceParticipantInitials } from '../../utils/voiceParticipantColor';
import {
  FIGMA_VOICE_TILE_AVATAR_FALLBACK,
  FIGMA_VOICE_TILE_BADGE_ROW,
  FIGMA_VOICE_TILE_BASE,
  FIGMA_VOICE_TILE_HOVER_BTN,
  FIGMA_VOICE_TILE_HOVER_BTN_DANGER,
  FIGMA_VOICE_TILE_HOVER_OVERLAY,
  FIGMA_VOICE_TILE_IDLE,
  FIGMA_VOICE_TILE_MUTE_BADGE,
  FIGMA_VOICE_TILE_NAME_BADGE,
  FIGMA_VOICE_TILE_ROLE_BADGE,
  FIGMA_VOICE_TILE_SPEAKING,
  FIGMA_VOICE_TILE_VIDEO,
  FIGMA_VOICE_TILE_YOU_BADGE,
} from './figmaVoiceClasses';

function LegacyTileShell({ children, className }) {
  return <div className={className}>{children}</div>;
}

export default function VoiceMeetingTile({
  suiteLayout = false,
  extraClass = '',
  isSpeaking = false,
  isMuted = false,
  name = '',
  youLabel = '',
  roleLabel = '',
  showYouBadge = false,
  hasVideo = false,
  videoRef,
  videoStream,
  localAvatar,
  localUserId,
  avatarSize = 'xl',
  camOffLabel = '',
  onHoverMute,
  onHoverKick,
  showHostActions = false,
  legacyClasses = {},
}) {
  const [hovered, setHovered] = useState(false);
  const accent = voiceParticipantColor(name);
  const initials = voiceParticipantInitials(name);

  const tileBase = suiteLayout
    ? `${FIGMA_VOICE_TILE_BASE} ${isSpeaking ? FIGMA_VOICE_TILE_SPEAKING : FIGMA_VOICE_TILE_IDLE}`
    : legacyClasses.tileBase || 'relative flex min-h-[220px] flex-col overflow-hidden rounded-xl border bg-black/40 md:min-h-[260px]';
  const speakingBorder = suiteLayout
    ? ''
    : isSpeaking
      ? legacyClasses.tileSpeaking || 'border-emerald-400/50'
      : legacyClasses.tileIdle || 'border-white/10';
  const videoClass = suiteLayout ? FIGMA_VOICE_TILE_VIDEO : legacyClasses.videoClass;
  const avatarFallbackClass = suiteLayout
    ? FIGMA_VOICE_TILE_AVATAR_FALLBACK
    : legacyClasses.avatarFallback;

  const Shell = suiteLayout ? 'div' : LegacyTileShell;

  return (
    <Shell
      className={`${tileBase} ${speakingBorder} ${extraClass}`}
      {...(suiteLayout
        ? {
            onMouseEnter: () => setHovered(true),
            onMouseLeave: () => setHovered(false),
          }
        : {})}
    >
      {hasVideo ? (
        <video
          autoPlay
          playsInline
          muted={Boolean(videoRef)}
          ref={(node) => {
            if (videoRef && typeof videoRef === 'object' && 'current' in videoRef) {
              videoRef.current = node;
            } else if (typeof videoRef === 'function') {
              videoRef(node);
            }
            const stream = videoStream;
            if (node && stream && node.srcObject !== stream) {
              node.srcObject = stream;
              node.play?.().catch(() => {});
            }
          }}
          className={videoClass}
        />
      ) : (
        <div
          className={avatarFallbackClass}
          style={suiteLayout ? { background: `linear-gradient(135deg, ${accent}18, #1A1A2E)` } : undefined}
        >
          {localAvatar !== undefined ? (
            <UserAvatar
              avatar={localAvatar}
              userId={localUserId}
              name={name}
              size={avatarSize === 'hero' ? 'hero' : 'xl'}
              className={avatarSize === 'hero' ? 'shadow-lg' : undefined}
            />
          ) : (
            <div
              className="flex h-16 w-16 items-center justify-center rounded-full text-xl font-bold"
              style={{
                background: `${accent}25`,
                color: accent,
                border: isSpeaking ? `2px solid ${accent}` : '2px solid transparent',
              }}
            >
              {initials}
            </div>
          )}
          {suiteLayout && isSpeaking ? <VoiceSpeakingWaveform color={accent} /> : null}
          {!suiteLayout && camOffLabel ? (
            <span className="text-xs text-gray-500">{camOffLabel}</span>
          ) : null}
        </div>
      )}

      <div
        className={
          suiteLayout ? FIGMA_VOICE_TILE_BADGE_ROW : 'absolute bottom-3 left-3 flex flex-wrap items-center gap-2'
        }
      >
        <span
          className={
            suiteLayout ? FIGMA_VOICE_TILE_NAME_BADGE : 'rounded-lg bg-black/70 px-2.5 py-1 text-xs font-medium text-white'
          }
        >
          {name}
        </span>
        {showYouBadge ? (
          <span
            className={
              suiteLayout
                ? FIGMA_VOICE_TILE_YOU_BADGE
                : 'rounded-md bg-violet-600/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white'
            }
          >
            {youLabel}
          </span>
        ) : null}
        {roleLabel ? (
          <span className={FIGMA_VOICE_TILE_ROLE_BADGE} style={{ background: accent }}>
            {roleLabel}
          </span>
        ) : null}
        {isMuted ? (
          <span
            className={
              suiteLayout
                ? FIGMA_VOICE_TILE_MUTE_BADGE
                : 'flex h-8 w-8 items-center justify-center rounded-full bg-red-600/90'
            }
          >
            <MicOff className={suiteLayout ? 'h-2.5 w-2.5 text-white' : 'h-4 w-4 text-white'} aria-hidden />
          </span>
        ) : null}
      </div>

      {suiteLayout && hovered && showHostActions ? (
        <div className={FIGMA_VOICE_TILE_HOVER_OVERLAY}>
          {onHoverMute ? (
            <button type="button" className={FIGMA_VOICE_TILE_HOVER_BTN} onClick={onHoverMute}>
              Tắt mic
            </button>
          ) : null}
          {onHoverKick ? (
            <button type="button" className={FIGMA_VOICE_TILE_HOVER_BTN_DANGER} onClick={onHoverKick}>
              Kick
            </button>
          ) : null}
        </div>
      ) : null}
    </Shell>
  );
}
