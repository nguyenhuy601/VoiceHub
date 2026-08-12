import { CalendarDays, Clock, Mic, Repeat2, Users } from 'lucide-react';
import {
  FIGMA_CAL_EVENT_CARD,
  FIGMA_CAL_SIDEBAR_BODY,
  FIGMA_CAL_SIDEBAR_DAY,
  FIGMA_CAL_SIDEBAR_HEADER,
  getCalEventTypeMeta,
  monthLabel,
} from './figmaCalendarClasses';
import CalendarUpcomingMonth from './CalendarUpcomingMonth';

export default function CalendarEventSidebar({
  selectedDate,
  events = [],
  selectedEvent,
  onSelectEvent,
  onOpenCreate,
  onJoinEvent,
  calendarWriteEnabled = true,
  upcomingMonthEvents = [],
  onUpcomingClick,
  locale = 'vi',
  t,
  today = new Date(),
}) {
  const monthName = monthLabel(selectedDate, locale);

  return (
    <aside className="flex h-full w-[280px] shrink-0 flex-col border-l border-border bg-surface">
      <div className={FIGMA_CAL_SIDEBAR_HEADER}>
        <div className="mb-1 flex items-baseline gap-1.5">
          <span className={FIGMA_CAL_SIDEBAR_DAY}>{selectedDate.getDate()}</span>
          <span className="text-sm text-muted-foreground">{monthName}</span>
        </div>
        <p className="m-0 text-xs text-muted-foreground">
          {events.length > 0 ? t('calendar.eventsCount', { n: events.length }) : t('calendar.noEvents')}
        </p>
      </div>

      <div className={FIGMA_CAL_SIDEBAR_BODY}>
        {events.length === 0 ? (
          <div className="pt-10 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
              <CalendarDays size={22} className="text-muted-foreground" />
            </div>
            <p className="mb-3.5 text-sm text-muted-foreground">{t('calendar.emptyDay')}</p>
            <button
              type="button"
              onClick={calendarWriteEnabled ? onOpenCreate : undefined}
              disabled={!calendarWriteEnabled}
              title={calendarWriteEnabled ? undefined : t('profile.comingSoon')}
              className={`h-[34px] rounded-lg border-none bg-primary px-4 text-[0.8125rem] font-semibold text-primary-foreground shadow-[0_3px_10px_rgba(37,99,235,0.35)]${calendarWriteEnabled ? '' : ' cursor-not-allowed opacity-50'}`}
            >
              {t('calendar.createEvent')}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {events.map((ev) => {
              const meta = getCalEventTypeMeta(ev, t);
              const expanded = selectedEvent?.id === ev.id;
              return (
                <div
                  key={ev.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectEvent?.(expanded ? null : ev)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectEvent?.(expanded ? null : ev);
                    }
                  }}
                  className={`${FIGMA_CAL_EVENT_CARD} ${
                    expanded ? `${meta.cardBg} ${meta.cardBorder}` : 'bg-muted'
                  }`}
                  style={{ borderLeftWidth: 3, borderLeftColor: meta.color }}
                >
                  <div className="mb-1.5 flex items-start justify-between gap-2">
                    <span className="text-sm font-semibold leading-snug text-foreground">
                      {ev.title}
                    </span>
                    <span
                      className={`shrink-0 rounded-full border px-[7px] py-px text-[0.625rem] font-bold ${meta.pillBg} ${meta.pillText} ${meta.cardBorder}`}
                    >
                      {meta.label}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1">
                    {(ev.time || ev.duration) && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock size={11} />
                        {ev.time}
                        {ev.duration ? ` · ${ev.duration}` : ''}
                        {meta.key === 'recurring' && <Repeat2 size={11} className="ml-0.5" />}
                      </div>
                    )}
                    {ev.attendees > 0 && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Users size={11} />
                        {t('calendar.peopleCount', { n: ev.attendees })}
                      </div>
                    )}
                  </div>
                  {expanded && (
                    <div className={`mt-2.5 border-t pt-2.5 ${meta.cardBorder}`}>
                      {ev.description && (
                        <p className="mb-2.5 text-[0.8125rem] leading-relaxed text-muted-foreground">
                          {ev.description}
                        </p>
                      )}
                      {(ev.type === 'meeting' || ev.kind === 'meeting') && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onJoinEvent?.(ev);
                          }}
                          className="inline-flex h-7 items-center gap-1 rounded-md border-none px-3 text-xs font-semibold text-primary-foreground"
                          style={{ background: meta.color }}
                        >
                          <Mic size={11} />
                          {t('calendar.joinAction')}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <CalendarUpcomingMonth
          events={upcomingMonthEvents}
          today={today}
          selectedDate={selectedDate}
          locale={locale}
          t={t}
          onEventClick={onUpcomingClick}
        />
      </div>
    </aside>
  );
}
