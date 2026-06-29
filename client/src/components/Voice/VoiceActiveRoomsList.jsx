import { useEffect, useMemo, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight, Clock, Globe, Mic, Play, User, Users } from 'lucide-react';
import { useAppStrings } from '../../locales/appStrings';
import { formatMeetingDuration } from '../../utils/voiceRecordingUtils';
import {
  FIGMA_VOICE_LOBBY_ROOM_CARD,
  FIGMA_VOICE_LOBBY_ROOM_ICON,
  FIGMA_VOICE_LOBBY_ROOM_JOIN_BTN,
  FIGMA_VOICE_LOBBY_ROOM_LIST,
  FIGMA_VOICE_LOBBY_ROOM_LIVE,
  FIGMA_VOICE_LOBBY_SECTION_HEAD,
  FIGMA_VOICE_LOBBY_SECTION_TITLE,
} from './figmaVoiceClasses';

export const MEETING_HISTORY_PAGE_SIZE = 5;
export const MEETING_HISTORY_MAX_PAGES = 5;
export const MEETING_HISTORY_MAX_ITEMS = MEETING_HISTORY_PAGE_SIZE * MEETING_HISTORY_MAX_PAGES;

function formatMeetingDate(value, locale) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function MeetingCard({
  meeting,
  compact,
  locale,
  joinText,
  t,
  onJoinMeeting,
  onPlayRecording,
}) {
  const active = meeting.active === true;
  const color = meeting.color || 'var(--primary)';
  const canPlay = !active && meeting.hasAudio === true && meeting.recordingStatus === 'ready';
  const canViewNotes =
    !active &&
    (meeting.hasTranscript === true || meeting.hasSummary === true || Boolean(meeting.summaryPreview));
  const clickable = active || canPlay || canViewNotes;

  return (
    <div
      className={`${FIGMA_VOICE_LOBBY_ROOM_CARD} ${compact ? 'flex-col items-stretch gap-2.5 p-3' : ''} ${clickable ? 'cursor-pointer' : 'cursor-default opacity-90'}`}
      onClick={() => {
        if (active) onJoinMeeting?.(meeting);
        else if (canPlay || canViewNotes) onPlayRecording?.(meeting);
      }}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && clickable) {
          e.preventDefault();
          if (active) onJoinMeeting?.(meeting);
          else if (canPlay || canViewNotes) onPlayRecording?.(meeting);
        }
      }}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
    >
      <div className={`flex min-w-0 gap-2.5 ${compact ? 'w-full items-start' : 'flex-1 items-center'}`}>
        <div
          className={`${FIGMA_VOICE_LOBBY_ROOM_ICON} ${compact ? 'h-9 w-9' : ''}`}
          style={{
            background: active
              ? `linear-gradient(135deg, color-mix(in srgb, ${color} 13%, transparent), color-mix(in srgb, ${color} 4%, transparent))`
              : undefined,
            borderColor: active ? `color-mix(in srgb, ${color} 20%, transparent)` : undefined,
          }}
        >
          <Mic
            className={compact ? 'h-4 w-4' : 'h-[19px] w-[19px]'}
            style={{ color: active ? color : undefined }}
            aria-hidden
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            <span className={`truncate font-semibold text-foreground ${compact ? 'text-sm' : 'text-[0.9375rem]'}`}>
              {meeting.title || meeting.lobbyRoomId || t('voiceRoom.roomTypeFree')}
            </span>
            {active ? (
              <span className={FIGMA_VOICE_LOBBY_ROOM_LIVE}>
                <span className="h-[5px] w-[5px] rounded-full bg-success shadow-[0_0_4px] shadow-success" />
                <span className="text-[0.625rem] font-bold tracking-wide text-success">LIVE</span>
              </span>
            ) : (
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[0.625rem] font-semibold text-muted-foreground">
                {t('voiceRoom.meetingEnded')}
              </span>
            )}
          </div>
          {!active && meeting.summaryPreview ? (
            <p className="mt-1 line-clamp-2 text-[0.6875rem] text-muted-foreground">{meeting.summaryPreview}</p>
          ) : null}
          <div className={`flex flex-col gap-0.5 text-muted-foreground ${compact ? 'text-[0.6875rem]' : 'text-xs'}`}>
            <span className="inline-flex items-center gap-1">
              <User className="h-[11px] w-[11px] shrink-0" aria-hidden />
              <span className="truncate">
                {t('voiceRoom.meetingHost', { name: meeting.hostName || t('voiceRoom.memberFallback') })}
              </span>
            </span>
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-[11px] w-[11px] shrink-0" aria-hidden />
              <span className="truncate">
                {t('voiceRoom.meetingCreatedAt', { date: formatMeetingDate(meeting.startTime, locale) })}
              </span>
            </span>
            <span className="inline-flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1">
                <Clock className="h-[11px] w-[11px] shrink-0" aria-hidden />
                {t('voiceRoom.meetingDuration', {
                  duration: formatMeetingDuration(meeting.durationSec || 0),
                })}
              </span>
              {active ? (
                <span className="inline-flex items-center gap-0.5">
                  <Users className="h-[11px] w-[11px]" aria-hidden />
                  {t('voiceRoom.roomParticipants', {
                    current: meeting.participants ?? 0,
                    max: meeting.max ?? 10,
                  })}
                </span>
              ) : null}
            </span>
          </div>
        </div>

        {!compact && active ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onJoinMeeting?.(meeting);
            }}
            className={FIGMA_VOICE_LOBBY_ROOM_JOIN_BTN}
            style={{
              background: `linear-gradient(135deg, ${color}, color-mix(in srgb, ${color} 80%, transparent))`,
              boxShadow: `0 3px 10px color-mix(in srgb, ${color} 21%, transparent)`,
            }}
          >
            {joinText}
          </button>
        ) : null}
        {!compact && !active && canPlay ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onPlayRecording?.(meeting);
            }}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/15"
          >
            <Play className="h-3.5 w-3.5" aria-hidden />
            {t('voiceRoom.playRecording')}
          </button>
        ) : null}
        {!compact && !active && !canPlay && canViewNotes ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onPlayRecording?.(meeting);
            }}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border bg-muted/50 px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
          >
            {t('voiceRoom.viewTranscript')}
          </button>
        ) : null}
        {!compact && !active && !canPlay && !canViewNotes ? (
          <span className="shrink-0 text-xs text-muted-foreground">{t('voiceRoom.noRecording')}</span>
        ) : null}
      </div>

      {compact ? (
        <div className="flex w-full">
          {active ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onJoinMeeting?.(meeting);
              }}
              className={`${FIGMA_VOICE_LOBBY_ROOM_JOIN_BTN} h-8 w-full`}
              style={{
                background: `linear-gradient(135deg, ${color}, color-mix(in srgb, ${color} 80%, transparent))`,
              }}
            >
              {joinText}
            </button>
          ) : canPlay || canViewNotes ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onPlayRecording?.(meeting);
              }}
              className="inline-flex h-8 w-full items-center justify-center gap-1 rounded-lg border border-primary/30 bg-primary/10 text-xs font-semibold text-primary hover:bg-primary/15"
            >
              <Play className="h-3.5 w-3.5" aria-hidden />
              {canPlay ? t('voiceRoom.playRecording') : t('voiceRoom.viewTranscript')}
            </button>
          ) : (
            <span className="w-full text-center text-[0.6875rem] text-muted-foreground">
              {t('voiceRoom.noRecording')}
            </span>
          )}
        </div>
      ) : null}
    </div>
  );
}

export default function VoiceActiveRoomsList({
  meetings = [],
  onJoinMeeting,
  onPlayRecording,
  joinLabel,
  emptyLabel,
  sectionTitle,
  summaryLabel = '',
  locale = 'vi-VN',
  compact = false,
  showPagination = false,
  page: controlledPage,
  onPageChange,
}) {
  const { t } = useAppStrings();
  const joinText = joinLabel || t('voiceRoom.joinAction');
  const emptyText = emptyLabel || t('voiceRoom.noActiveRooms');
  const sectionTitleText = sectionTitle || t('voiceRoom.activeRoomsTitle');

  const [internalPage, setInternalPage] = useState(1);
  const page = controlledPage ?? internalPage;
  const setPage = onPageChange ?? setInternalPage;

  const cappedMeetings = useMemo(
    () => meetings.slice(0, MEETING_HISTORY_MAX_ITEMS),
    [meetings]
  );

  const totalPages = Math.min(
    MEETING_HISTORY_MAX_PAGES,
    Math.max(1, Math.ceil(cappedMeetings.length / MEETING_HISTORY_PAGE_SIZE))
  );

  const pagedMeetings = useMemo(() => {
    const start = (page - 1) * MEETING_HISTORY_PAGE_SIZE;
    return cappedMeetings.slice(start, start + MEETING_HISTORY_PAGE_SIZE);
  }, [cappedMeetings, page]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages, setPage]);

  useEffect(() => {
    setPage(1);
  }, [meetings.length, setPage]);

  const activeCount = cappedMeetings.filter((m) => m.active).length;
  const participantTotal = cappedMeetings.reduce((sum, m) => sum + (Number(m.participants) || 0), 0);

  const listBody = !cappedMeetings.length ? (
    <div className="rounded-xl border border-border bg-surface px-4 py-6 text-center text-sm text-muted-foreground">
      {emptyText}
    </div>
  ) : (
    <>
      <div className={FIGMA_VOICE_LOBBY_ROOM_LIST}>
        {pagedMeetings.map((meeting) => (
          <MeetingCard
            key={meeting.id}
            meeting={meeting}
            compact={compact}
            locale={locale}
            joinText={joinText}
            t={t}
            onJoinMeeting={onJoinMeeting}
            onPlayRecording={onPlayRecording}
          />
        ))}
      </div>
      {showPagination && totalPages > 1 ? (
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-40"
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
            {t('voiceRoom.historyPrev')}
          </button>
          <span className="text-xs text-muted-foreground">
            {t('voiceRoom.historyPage', { page, total: totalPages })}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-40"
          >
            {t('voiceRoom.historyNext')}
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      ) : null}
    </>
  );

  if (compact) {
    return <div className="min-h-0 flex-1 overflow-y-auto">{listBody}</div>;
  }

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
      {listBody}
    </div>
  );
}
