import { CalendarDays, Clock, Mic, Repeat2, Users } from 'lucide-react';
import { toDateKey } from '../../utils/calendarUtils';
import { CALENDAR_DAILY_HOURS_LIMIT, sumHoursForDate } from '../../utils/calendarWorkSpread';
import CalendarDayTimeline from './CalendarDayTimeline';
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
  loading = false,
}) {
  const monthName = monthLabel(selectedDate, locale);
  const dateKey = toDateKey(selectedDate);
  const workHours = sumHoursForDate(events, dateKey);
  const overLimit = workHours > CALENDAR_DAILY_HOURS_LIMIT;
  const timedEvents = (events || []).filter((e) => e.startAt && (e.kind === 'work' || e.kind === 'meeting' || e.type === 'work' || e.type === 'meeting'));

  return (
    <aside
      aria-label={t('calendar.sidebarAria')}
      className="flex h-full w-[300px] shrink-0 flex-col border-l border-border bg-surface"
    >
      <div className={FIGMA_CAL_SIDEBAR_HEADER}>
        <div className="mb-1 flex items-baseline gap-1.5">
          <span className={FIGMA_CAL_SIDEBAR_DAY}>{selectedDate.getDate()}</span>
          <span className="text-sm text-muted-foreground">{monthName}</span>
        </div>
        <p className="m-0 text-xs text-muted-foreground">
          {events.length > 0
            ? t('calendar.eventsCount', { n: events.length })
            : t('calendar.noEvents')}
        </p>
        {workHours > 0 ? (
          <p
            className={`mt-1.5 m-0 text-xs font-semibold ${
              overLimit ? 'text-error' : 'text-foreground'
            }`}
          >
            {t('calendar.workHoursSummary', { hours: workHours })}
            {overLimit
              ? ` · ${t('calendar.workHoursOver', { limit: CALENDAR_DAILY_HOURS_LIMIT })}`
              : ''}
          </p>
        ) : null}
        <p className="mt-1 m-0 text-[0.65rem] text-muted-foreground">
          {t('calendar.estimateHint')}
        </p>
      </div>

      <div className={FIGMA_CAL_SIDEBAR_BODY}>
        {timedEvents.length > 0 ? (
          <div className="mb-3">
            <CalendarDayTimeline
              events={timedEvents}
              onSelectEvent={onSelectEvent}
              selectedEventId={selectedEvent?.id}
              t={t}
            />
          </div>
        ) : null}

        {events.length === 0 && loading ? (
          <div className="flex flex-col gap-2" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 rounded-[10px] bg-muted motion-safe:animate-pulse" />
            ))}
          </div>
        ) : events.length === 0 ? (
          <div className="pt-6 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
              <CalendarDays size={22} className="text-muted-foreground" aria-hidden="true" />
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
                  className={`${FIGMA_CAL_EVENT_CARD} focus-within:ring-2 focus-within:ring-primary/30 ${
                    expanded ? `${meta.cardBg} ${meta.cardBorder}` : 'bg-muted'
                  }`}
                  style={{ borderLeftWidth: 3, borderLeftColor: meta.color }}
                >
                  <button
                    type="button"
                    aria-expanded={expanded}
                    onClick={() => onSelectEvent?.(expanded ? null : ev)}
                    className="block w-full border-none bg-transparent p-0 text-left focus-visible:outline-none"
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
                    {(ev.time || ev.duration || ev.hours) && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock size={11} aria-hidden="true" />
                        {ev.time}
                        {ev.duration ? ` · ${ev.duration}` : ''}
                        {ev.hours > 0 && !ev.duration ? ` · ${ev.hours}h` : ''}
                        {ev.estimated ? ` · ${t('calendar.estimateHintShort')}` : ''}
                        {meta.key === 'recurring' && <Repeat2 size={11} className="ml-0.5" aria-hidden="true" />}
                      </div>
                    )}
                    {ev.attendees > 0 && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Users size={11} aria-hidden="true" />
                        {t('calendar.peopleCount', { n: ev.attendees })}
                      </div>
                    )}
                  </div>
                  </button>
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
                          onClick={() => onJoinEvent?.(ev)}
                          className="inline-flex h-7 items-center gap-1 rounded-md border-none px-3 text-xs font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                          style={{ background: meta.color }}
                        >
                          <Mic size={11} aria-hidden="true" />
                          {t('calendar.joinAction')}
                        </button>
                      )}
                      {(ev.kind === 'work' || ev.kind === 'task' || ev.type === 'deadline') && (
                        <button
                          type="button"
                          onClick={() => onJoinEvent?.(ev)}
                          className="inline-flex h-7 items-center gap-1 rounded-md border-none bg-primary px-3 text-xs font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                        >
                          {t('calendar.openTaskBtn')}
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
