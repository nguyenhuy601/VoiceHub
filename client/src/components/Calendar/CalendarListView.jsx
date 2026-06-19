import { Clock, Repeat2, Users } from 'lucide-react';
import { toDateKey } from '../../utils/calendarUtils';
import {
  FIGMA_CAL_LIST_ROW,
  getCalEventTypeMeta,
  monthLabel,
} from './figmaCalendarClasses';

export default function CalendarListView({
  events = [],
  selectedDate,
  onSelectDate,
  onSelectEvent,
  locale = 'vi',
  t,
}) {
  const sorted = [...events].sort((a, b) => {
    const da = a.date || '';
    const db = b.date || '';
    if (da !== db) return da.localeCompare(db);
    return String(a.time || '').localeCompare(String(b.time || ''));
  });

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-sm text-muted-foreground">{t('calendar.noEvents')}</p>
      </div>
    );
  }

  let lastKey = '';

  return (
    <div className="flex flex-col gap-2">
      {sorted.map((ev) => {
        const dateKey = ev.date || '';
        const showHeader = dateKey !== lastKey;
        lastKey = dateKey;
        const meta = getCalEventTypeMeta(ev, t);
        const d = dateKey ? new Date(`${dateKey}T12:00:00`) : null;
        const isSelected = selectedDate && dateKey === toDateKey(selectedDate);

        return (
          <div key={ev.id}>
            {showHeader && d && !Number.isNaN(d.getTime()) && (
              <div
                className={`mb-2 mt-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground ${
                  sorted.indexOf(ev) === 0 ? 'mt-0' : ''
                }`}
              >
                {d.getDate()} {monthLabel(d, locale)} {d.getFullYear()}
              </div>
            )}
            <button
              type="button"
              onClick={() => {
                if (d) onSelectDate?.(d);
                onSelectEvent?.(ev);
              }}
              className={`${FIGMA_CAL_LIST_ROW} w-full text-left ${
                isSelected ? 'border-primary/40 bg-primary/[0.05]' : ''
              }`}
            >
              <div
                className="h-10 w-1 shrink-0 rounded-full"
                style={{ background: meta.color }}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-foreground">{ev.title}</div>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  {ev.time && (
                    <span className="inline-flex items-center gap-1">
                      <Clock size={11} />
                      {ev.time}
                      {ev.duration ? ` · ${ev.duration}` : ''}
                    </span>
                  )}
                  {ev.attendees > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <Users size={11} />
                      {t('calendar.peopleCount', { n: ev.attendees })}
                    </span>
                  )}
                  {meta.key === 'recurring' && <Repeat2 size={11} />}
                </div>
              </div>
              <span
                className={`shrink-0 rounded-full border px-2 py-0.5 text-[0.625rem] font-bold ${meta.pillBg} ${meta.pillText} ${meta.cardBorder}`}
              >
                {meta.label}
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
