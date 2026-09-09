import { toDateKey } from '../../utils/calendarUtils';
import { CALENDAR_DAILY_HOURS_LIMIT, sumHoursForDate } from '../../utils/calendarWorkSpread';
import CalendarDayTimeline from './CalendarDayTimeline';
import {
  FIGMA_CAL_DAY_HEADER,
  FIGMA_CAL_DAY_HEADER_SUN,
  weekdayLabels,
} from './figmaCalendarClasses';

function sameDay(a, b) {
  return toDateKey(a) === toDateKey(b);
}

export default function CalendarWeekView({
  events = [],
  selectedDate,
  onSelectDate,
  onSelectEvent,
  selectedEvent,
  locale = 'vi',
  t,
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const anchor = selectedDate ? new Date(selectedDate) : today;
  const start = new Date(anchor);
  start.setDate(anchor.getDate() - anchor.getDay());
  start.setHours(0, 0, 0, 0);

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });

  const labels = weekdayLabels(locale, t);

  const getEventsForDate = (date) => events.filter((e) => e.date === toDateKey(date));

  return (
    <div className="overflow-x-auto">
      <div className="mb-1 grid min-w-[720px] grid-cols-7 gap-1">
        {labels.map((label, i) => (
          <div
            key={label}
            className={`${FIGMA_CAL_DAY_HEADER} ${i === 0 ? FIGMA_CAL_DAY_HEADER_SUN : ''}`}
          >
            {label}
          </div>
        ))}
      </div>
      <div className="grid min-w-[720px] grid-cols-7 gap-1">
        {weekDays.map((date) => {
          const key = toDateKey(date);
          const dayEvents = getEventsForDate(date);
          const isToday = sameDay(date, today);
          const isSelected = selectedDate && sameDay(date, selectedDate);
          const isWeekend = date.getDay() === 0 || date.getDay() === 6;
          const workHours = sumHoursForDate(events, key);
          const overLimit = workHours > CALENDAR_DAILY_HOURS_LIMIT;

          return (
            <div
              key={key}
              className={`rounded-[10px] border bg-surface p-1.5 ${
                isSelected ? 'border-primary/50 bg-primary/[0.06]' : 'border-border'
              }`}
            >
              <button
                type="button"
                onClick={() => onSelectDate?.(date)}
                className={`mb-1 flex w-full flex-col items-center gap-0.5 rounded-lg border-none bg-transparent p-1 transition ${
                  isToday
                    ? 'text-primary'
                    : isWeekend
                      ? 'text-error'
                      : 'text-foreground'
                }`}
              >
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-sm ${
                    isToday
                      ? 'bg-gradient-to-br from-primary to-primary-hover font-bold text-primary-foreground'
                      : ''
                  }`}
                >
                  {date.getDate()}
                </span>
                {workHours > 0 ? (
                  <span
                    className={`text-[0.6rem] font-semibold ${
                      overLimit ? 'text-error' : 'text-muted-foreground'
                    }`}
                  >
                    {workHours}h
                    {overLimit ? '!' : ''}
                  </span>
                ) : null}
              </button>
              <CalendarDayTimeline
                events={dayEvents}
                onSelectEvent={(ev) => {
                  onSelectDate?.(date);
                  onSelectEvent?.(ev);
                }}
                selectedEventId={selectedEvent?.id}
                t={t}
                compact
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
