import {
  CALENDAR_TIMELINE_END_HOUR,
  CALENDAR_TIMELINE_START_HOUR,
} from '../../utils/calendarWorkSpread';
import { getCalEventTypeMeta } from './figmaCalendarClasses';

const HOUR_PX = 48;

function minutesFromMidnight(d) {
  if (!d) return null;
  const x = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(x.getTime())) return null;
  return x.getHours() * 60 + x.getMinutes();
}

/**
 * Trục giờ trong ngày — absolute-position blocks (meeting + work ước lượng).
 */
export default function CalendarDayTimeline({
  events = [],
  onSelectEvent,
  selectedEventId,
  t,
  compact = false,
  className = '',
}) {
  const startH = CALENDAR_TIMELINE_START_HOUR;
  const endH = CALENDAR_TIMELINE_END_HOUR;
  const hours = [];
  for (let h = startH; h <= endH; h += 1) hours.push(h);

  const rangeStart = startH * 60;
  const rangeEnd = endH * 60;
  const totalMins = Math.max(60, rangeEnd - rangeStart);
  const height = ((endH - startH) * HOUR_PX) / (compact ? 1.25 : 1);

  const positioned = (events || [])
    .map((ev) => {
      let startM = minutesFromMidnight(ev.startAt);
      let endM = minutesFromMidnight(ev.endAt);
      if (startM == null) return null;
      if (endM == null || endM <= startM) {
        const hoursVal = Number(ev.hours);
        endM = startM + Math.max(30, Math.round((Number.isFinite(hoursVal) ? hoursVal : 0.5) * 60));
      }
      const clampedStart = Math.max(rangeStart, Math.min(rangeEnd - 15, startM));
      const clampedEnd = Math.max(clampedStart + 15, Math.min(rangeEnd, endM));
      const top = ((clampedStart - rangeStart) / totalMins) * 100;
      const blockH = ((clampedEnd - clampedStart) / totalMins) * 100;
      return { ev, top, blockH };
    })
    .filter(Boolean);

  return (
    <div className={`relative flex ${className}`}>
      <div
        className={`shrink-0 pr-1 text-right text-[0.65rem] text-muted-foreground ${
          compact ? 'w-8' : 'w-10'
        }`}
        style={{ height }}
      >
        {hours.map((h) => (
          <div
            key={h}
            className="relative"
            style={{ height: height / (endH - startH) }}
          >
            <span className="absolute -top-1.5 right-0">
              {String(h).padStart(2, '0')}:00
            </span>
          </div>
        ))}
      </div>
      <div
        className="relative min-w-0 flex-1 rounded-lg border border-border bg-muted/30"
        style={{ height }}
      >
        {hours.map((h) => (
          <div
            key={`line-${h}`}
            className="pointer-events-none absolute left-0 right-0 border-t border-border/60"
            style={{ top: `${((h - startH) / (endH - startH)) * 100}%` }}
          />
        ))}
        {positioned.map(({ ev, top, blockH }) => {
          const meta = getCalEventTypeMeta(ev, t);
          const selected = selectedEventId && selectedEventId === ev.id;
          return (
            <button
              key={ev.id}
              type="button"
              title={`${ev.time || ''} ${ev.title}${ev.estimated ? ` (${t ? t('calendar.estimateHintShort') : 'est.'})` : ''}`}
              onClick={() => onSelectEvent?.(ev)}
              className={`absolute left-0.5 right-0.5 overflow-hidden rounded border-l-2 px-1 py-0.5 text-left text-[0.65rem] font-semibold leading-tight transition ${
                meta.pillBg
              } ${meta.pillText} ${meta.pillBorder} ${
                selected ? 'ring-2 ring-primary/40' : ''
              }`}
              style={{
                top: `${top}%`,
                height: `${Math.max(blockH, 4)}%`,
                borderLeftColor: meta.color,
              }}
            >
              <span className="block truncate">{ev.title}</span>
              {!compact && ev.time ? (
                <span className="block truncate opacity-80">
                  {ev.time}
                  {ev.hours != null && Number(ev.hours) > 0
                    ? ` · ${Number(ev.hours)}h`
                    : ''}
                  {ev.estimated ? ` · ${t ? t('calendar.estimateHintShort') : 'est.'}` : ''}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
