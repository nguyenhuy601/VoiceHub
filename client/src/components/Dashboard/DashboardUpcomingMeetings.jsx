import { Calendar, ChevronRight, Clock, Mic, Users } from 'lucide-react';
import { useAppStrings } from '../../locales/appStrings';
import {
  FIGMA_DASH_ACTION_BTN,
  FIGMA_DASH_ACTION_BTN_PRIMARY,
  FIGMA_DASH_LINK_BTN,
  FIGMA_DASH_MEETING_ITEM,
  FIGMA_DASH_MEETING_SOON,
  FIGMA_DASH_PANEL,
  FIGMA_DASH_PANEL_HEADER,
  FIGMA_DASH_PANEL_TITLE,
} from './figmaDashboardClasses';

export default function DashboardUpcomingMeetings({
  meetings,
  emptyLabel,
  onViewCalendar,
  onMeetingClick,
  onCreateRoom,
}) {
  const { t } = useAppStrings();

  return (
    <div className={`${FIGMA_DASH_PANEL} flex flex-col`}>
      <div className={FIGMA_DASH_PANEL_HEADER}>
        <div className={FIGMA_DASH_PANEL_TITLE}>
          <Calendar size={15} className="text-info" />
          {t('dashboard.upcomingMeetingsTitle')}
        </div>
        <button type="button" className={FIGMA_DASH_LINK_BTN} onClick={onViewCalendar}>
          {t('dashboard.calendarLink')} <ChevronRight size={12} />
        </button>
      </div>
      <div className="flex flex-1 flex-col gap-[7px]">
        {meetings.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-2 py-2 text-xs text-muted-foreground">
            {emptyLabel ?? t('dashboard.noMeetingsWeek')}
          </p>
        ) : (
          meetings.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => onMeetingClick?.(m)}
              className={FIGMA_DASH_MEETING_ITEM}
              style={{
                background: m.soon ? `${m.color}08` : 'var(--background)',
                borderColor: m.soon ? `${m.color}25` : 'var(--border)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = `${m.color}40`;
                e.currentTarget.style.background = `${m.color}08`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = m.soon ? `${m.color}25` : 'var(--border)';
                e.currentTarget.style.background = m.soon ? `${m.color}08` : 'var(--background)';
              }}
            >
              <div className="flex items-center gap-[7px]">
                <div className="h-1 w-1 shrink-0 rounded-full" style={{ background: m.color }} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-[5px]">
                    <span className="truncate text-[0.8125rem] font-medium text-foreground">{m.title}</span>
                    {m.soon ? (
                      <span
                        className={FIGMA_DASH_MEETING_SOON}
                        style={{ background: `${m.color}18`, color: m.color }}
                      >
                        {t('dashboard.meetingSoonBadge')}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-0.5 flex gap-2">
                    <span className="flex items-center gap-[3px] text-[0.6875rem] text-muted-foreground">
                      <Clock size={10} />
                      {m.time}
                    </span>
                    <span className="flex items-center gap-[3px] text-[0.6875rem] text-muted-foreground">
                      <Users size={10} />
                      {m.attendees}
                    </span>
                  </div>
                </div>
              </div>
            </button>
          ))
        )}
      </div>
      <button
        type="button"
        onClick={onCreateRoom}
        className={`${FIGMA_DASH_ACTION_BTN} ${FIGMA_DASH_ACTION_BTN_PRIMARY}`}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(37,99,235,0.12)';
          e.currentTarget.style.borderColor = 'rgba(37,99,235,0.25)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(37,99,235,0.06)';
          e.currentTarget.style.borderColor = 'rgba(37,99,235,0.12)';
        }}
      >
        <Mic size={13} />
        {t('dashboard.createMeetingRoom')}
      </button>
    </div>
  );
}
