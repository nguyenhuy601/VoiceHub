import { toDateKey } from '../../utils/calendarUtils';
import {
  FIGMA_CAL_DAY_HEADER,
  FIGMA_CAL_DAY_HEADER_SUN,
  FIGMA_CAL_EVENT_PILL,
  FIGMA_CAL_WEEK_COL,
  getCalEventTypeMeta,
  weekdayLabels,
} from './figmaCalendarClasses';

function sameDay(a, b) {
  return toDateKey(a) === toDateKey(b);
}

export default function CalendarWeekView({
  events = [],
  selectedDate,
  onSelectDate,
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

  const getEventsForDate = (date) =>
    events.filter((e) => e.date === toDateKey(date));

  return (
    <div>
      <div className="mb-1 grid grid-cols-7 gap-1">
        {labels.map((label, i) => (
          <div
            key={label}
            className={`${FIGMA_CAL_DAY_HEADER} ${i === 0 ? FIGMA_CAL_DAY_HEADER_SUN : ''}`}
          >
            {label}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {weekDays.map((date, i) => {
          const dayEvents = getEventsForDate(date);
          const isToday = sameDay(date, today);
          const isSelected = selectedDate && sameDay(date, selectedDate);
          const isWeekend = date.getDay() === 0 || date.getDay() === 6;

          return (
            <div
              key={toDateKey(date)}
              className={`${FIGMA_CAL_WEEK_COL} ${
                isSelected ? 'border-primary/50 bg-primary/[0.06]' : ''
              }`}
            >
              <button
                type="button"
                onClick={() => onSelectDate?.(date)}
                className={`mb-2 flex w-full flex-col items-center gap-0.5 rounded-lg border-none bg-transparent p-1 transition ${
                  isToday
                    ? 'text-primary-foreground'
                    : isWeekend
                      ? 'text-error'
                      : 'text-foreground'
                }`}
              >
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-sm ${
                    isToday
                      ? 'bg-gradient-to-br from-primary to-primary-hover font-bold text-primary-foreground shadow-[0_2px_8px_rgba(37,99,235,0.4)]'
                      : ''
                  }`}
                >
                  {date.getDate()}
                </span>
                <span className="text-[0.65rem] text-muted-foreground">{labels[i]}</span>
              </button>
              <div className="flex flex-col gap-1">
                {dayEvents.map((ev) => {
                  const meta = getCalEventTypeMeta(ev, t);
                  return (
                    <button
                      key={ev.id}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectDate?.(date);
                      }}
                      className={`${FIGMA_CAL_EVENT_PILL} ${meta.pillBg} ${meta.pillText} text-left ${meta.pillBorder}`}
                      title={ev.title}
                    >
                      {ev.time ? `${ev.time} ` : ''}
                      {ev.title}
                    </button>
                  );
                })}
                {dayEvents.length === 0 && (
                  <p className="py-4 text-center text-[0.7rem] text-muted-foreground">—</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
