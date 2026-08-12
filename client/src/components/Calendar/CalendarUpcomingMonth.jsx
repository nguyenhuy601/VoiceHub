import { toDateKey } from '../../utils/calendarUtils';
import {
  FIGMA_CAL_UPCOMING_TITLE,
  getCalEventTypeMeta,
  monthLabel,
} from './figmaCalendarClasses';

export default function CalendarUpcomingMonth({
  events = [],
  today = new Date(),
  selectedDate,
  locale = 'vi',
  t,
  onEventClick,
  limit = 3,
}) {
  const todayKey = toDateKey(today);
  const selectedKey = selectedDate ? toDateKey(selectedDate) : '';

  const upcoming = events
    .filter((e) => {
      if (!e.date) return false;
      if (e.date === todayKey) return false;
      if (e.date === selectedKey) return false;
      const d = new Date(`${e.date}T12:00:00`);
      const dayStart = new Date(today);
      dayStart.setHours(0, 0, 0, 0);
      return d >= dayStart;
    })
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .slice(0, limit);

  if (upcoming.length === 0) return null;

  return (
    <div className="mt-5">
      <div className={FIGMA_CAL_UPCOMING_TITLE}>
        {t ? t('calendar.sidebarUpcomingTitle') : 'Upcoming'}
      </div>
      {upcoming.map((ev) => {
        const meta = getCalEventTypeMeta(ev, t);
        const d = new Date(`${ev.date}T12:00:00`);
        return (
          <button
            key={ev.id}
            type="button"
            onClick={() => onEventClick?.(ev, d)}
            className="flex w-full items-center gap-2 border-b border-border py-1.5 text-left transition hover:bg-muted/50"
          >
            <div
              className="h-1 w-1 shrink-0 rounded-full"
              style={{ background: meta.color }}
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[0.8125rem] text-foreground">{ev.title}</div>
              <div className="text-[0.7rem] text-muted-foreground">
                {d.getDate()} {monthLabel(d, locale)}
                {ev.time ? ` · ${ev.time}` : ''}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
