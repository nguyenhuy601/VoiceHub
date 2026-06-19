import { Globe, Hash, Mic, Users } from 'lucide-react';
import { useAppStrings } from '../../locales/appStrings';
import {
  FIGMA_VOICE_LOBBY_ROOM_CARD,
  FIGMA_VOICE_LOBBY_ROOM_ICON,
  FIGMA_VOICE_LOBBY_ROOM_JOIN_BTN,
  FIGMA_VOICE_LOBBY_ROOM_LIST,
  FIGMA_VOICE_LOBBY_ROOM_LIVE,
  FIGMA_VOICE_LOBBY_SECTION_HEAD,
  FIGMA_VOICE_LOBBY_SECTION_TITLE,
} from './figmaVoiceClasses';

export default function VoiceActiveRoomsList({
  rooms = [],
  onJoinRoom,
  joinLabel,
  emptyLabel,
  sectionTitle,
  summaryLabel = '',
}) {
  const { t } = useAppStrings();
  const joinText = joinLabel || t('voiceRoom.joinAction');
  const emptyText = emptyLabel || t('voiceRoom.noActiveRooms');
  const sectionTitleText = sectionTitle || t('voiceRoom.activeRoomsTitle');
  if (!rooms.length) {
    return (
      <div>
        <div className={FIGMA_VOICE_LOBBY_SECTION_HEAD}>
          <div className={FIGMA_VOICE_LOBBY_SECTION_TITLE}>
            <Globe className="h-[15px] w-[15px] text-success" aria-hidden />
            {sectionTitleText}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-surface px-4 py-6 text-center text-sm text-muted-foreground">
          {emptyText}
        </div>
      </div>
    );
  }

  const activeCount = rooms.filter((r) => r.active !== false).length;
  const participantTotal = rooms.reduce((sum, r) => sum + (Number(r.participants) || 0), 0);

  return (
    <div>
      <div className={FIGMA_VOICE_LOBBY_SECTION_HEAD}>
        <div className={FIGMA_VOICE_LOBBY_SECTION_TITLE}>
          <Globe className="h-[15px] w-[15px] text-success" aria-hidden />
          {sectionTitleText}
        </div>
        <span className="text-xs text-muted-foreground">
          {summaryLabel || t('voiceRoom.activeRoomsSummary', { rooms: activeCount, users: participantTotal })}
        </span>
      </div>

      <div className={FIGMA_VOICE_LOBBY_ROOM_LIST}>
        {rooms.map((room) => {
          const active = room.active !== false;
          const color = room.color || 'var(--primary)';
          return (
            <div
              key={room.id}
              className={`${FIGMA_VOICE_LOBBY_ROOM_CARD} ${active ? '' : 'cursor-default opacity-80'}`}
              onClick={() => active && onJoinRoom?.(room)}
              onKeyDown={(e) => {
                if ((e.key === 'Enter' || e.key === ' ') && active) {
                  e.preventDefault();
                  onJoinRoom?.(room);
                }
              }}
              role={active ? 'button' : undefined}
              tabIndex={active ? 0 : undefined}
            >
              <div
                className={FIGMA_VOICE_LOBBY_ROOM_ICON}
                style={{
                  background: active
                    ? `linear-gradient(135deg, color-mix(in srgb, ${color} 13%, transparent), color-mix(in srgb, ${color} 4%, transparent))`
                    : undefined,
                  borderColor: active ? `color-mix(in srgb, ${color} 20%, transparent)` : undefined,
                }}
              >
                <Mic
                  className="h-[19px] w-[19px]"
                  style={{ color: active ? color : undefined }}
                  aria-hidden
                />
              </div>

              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="truncate text-[0.9375rem] font-semibold text-foreground">
                    {room.name}
                  </span>
                  {active ? (
                    <span className={FIGMA_VOICE_LOBBY_ROOM_LIVE}>
                      <span className="h-[5px] w-[5px] rounded-full bg-success shadow-[0_0_4px] shadow-success" />
                      <span className="text-[0.625rem] font-bold tracking-wide text-success">LIVE</span>
                    </span>
                  ) : (
                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[0.625rem] font-semibold text-muted-foreground">
                      {t('voiceRoom.emptyState')}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-3.5 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-0.5">
                    <Users className="h-[11px] w-[11px]" aria-hidden />
                    {t('voiceRoom.roomParticipants', { current: room.participants ?? 0, max: room.max ?? 15 })}
                  </span>
                  {room.channel ? (
                    <span className="inline-flex items-center gap-0.5">
                      <Hash className="h-[11px] w-[11px]" aria-hidden />
                      {String(room.channel).replace(/^#/, '')}
                    </span>
                  ) : null}
                </div>
              </div>

              {active ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onJoinRoom?.(room);
                  }}
                  className={FIGMA_VOICE_LOBBY_ROOM_JOIN_BTN}
                  style={{
                    background: `linear-gradient(135deg, ${color}, color-mix(in srgb, ${color} 80%, transparent))`,
                    boxShadow: `0 3px 10px color-mix(in srgb, ${color} 21%, transparent)`,
                  }}
                >
                  {joinText}
                </button>
              ) : (
                <span className="shrink-0 text-xs text-muted-foreground">{t('voiceRoom.noParticipants')}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
