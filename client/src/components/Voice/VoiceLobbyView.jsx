import { useCallback, useState } from 'react';
import { ChevronLeft, ChevronRight, Hash, History, Mic, Plus } from 'lucide-react';
import {
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
  FIGMA_VOICE_LOBBY_PAGE_INNER,
  FIGMA_VOICE_LOBBY_PRIMARY_BTN,
  FIGMA_VOICE_LOBBY_ROOT,
  FIGMA_VOICE_LOBBY_SCROLL,
  FIGMA_VOICE_LOBBY_SECTION_TITLE,
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
const HISTORY_OPEN_KEY = 'vh.voice.historyOpen';

function readHistoryOpen() {
  try {
    const raw = localStorage.getItem(HISTORY_OPEN_KEY);
    if (raw === '0') return false;
    if (raw === '1') return true;
  } catch {
    /* ignore */
  }
  return true;
}

export default function VoiceLobbyView({
  title,
  liveRoomsCount = 0,
  liveRoomsLabel,
  roomCode = '',
  onRoomCodeChange,
  onCreateRoom,
  onJoinByCode,
  rooms = [],
  meetings = rooms,
  onJoinRoom,
  onListenAgain,
  onViewSummary,
  locale = 'vi-VN',
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
  const [historyOpen, setHistoryOpen] = useState(readHistoryOpen);

  const toggleHistory = useCallback(() => {
    setHistoryOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(HISTORY_OPEN_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

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

  const activeCount = meetings.filter((m) => m.active).length;
  const participantTotal = meetings.reduce((sum, m) => sum + (Number(m.participants) || 0), 0);

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

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <main className={`min-w-0 flex-1 ${FIGMA_VOICE_LOBBY_SCROLL}`}>
          <div className={`${FIGMA_VOICE_LOBBY_PAGE_INNER} max-w-[760px]`}>
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
                <div className="flex flex-col gap-2 sm:flex-row">
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
          </div>
        </main>

        <aside
          className={`flex shrink-0 flex-col border-l border-border bg-surface/50 transition-[width] duration-200 ${
            historyOpen ? 'w-full max-w-[22rem] sm:w-[min(100%,22rem)]' : 'w-11'
          }`}
        >
          {historyOpen ? (
            <>
              <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
                <div className={FIGMA_VOICE_LOBBY_SECTION_TITLE}>
                  <History className="h-4 w-4 text-primary" aria-hidden />
                  <span className="text-sm">{t('voiceRoom.activeRoomsTitle')}</span>
                </div>
                <button
                  type="button"
                  onClick={toggleHistory}
                  className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
                  aria-label={t('voiceRoom.historyCollapse')}
                  title={t('voiceRoom.historyCollapse')}
                >
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </button>
              </div>
              <p className="border-b border-border px-3 py-2 text-[0.6875rem] text-muted-foreground">
                {t('voiceRoom.activeRoomsSummary', { rooms: activeCount, users: participantTotal })}
              </p>
              <div className="flex min-h-0 flex-1 flex-col px-3 py-3">
                <VoiceActiveRoomsList
                  meetings={meetings}
                  onJoinMeeting={onJoinRoom}
                  onListenAgain={onListenAgain}
                  onViewSummary={onViewSummary}
                  locale={locale}
                  compact
                  showPagination
                />
              </div>
            </>
          ) : (
            <button
              type="button"
              onClick={toggleHistory}
              className="flex h-full flex-col items-center gap-2 px-1 py-4 text-muted-foreground hover:bg-muted/60"
              aria-label={t('voiceRoom.historyExpand')}
              title={t('voiceRoom.historyExpand')}
            >
              <ChevronLeft className="h-4 w-4 shrink-0" aria-hidden />
              <History className="h-4 w-4 shrink-0" aria-hidden />
              <span className="text-[0.625rem] font-semibold [writing-mode:vertical-rl]">
                {t('voiceRoom.historyRailLabel')}
              </span>
            </button>
          )}
        </aside>
      </div>
    </div>
  );
}
