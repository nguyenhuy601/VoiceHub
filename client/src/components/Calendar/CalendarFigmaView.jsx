import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { toDateKey } from '../../utils/calendarUtils';
import CalendarEventSidebar from './CalendarEventSidebar';
import CalendarListView from './CalendarListView';
import CalendarViewModeToggle from './CalendarViewModeToggle';
import CalendarWeekView from './CalendarWeekView';
import {
  FIGMA_CAL_CELL,
  FIGMA_CAL_CELL_DEFAULT,
  FIGMA_CAL_CELL_OUTSIDE,
  FIGMA_CAL_CELL_SELECTED,
  FIGMA_CAL_CELL_TODAY,
  FIGMA_CAL_CREATE_BTN,
  FIGMA_CAL_DAY_HEADER,
  FIGMA_CAL_DAY_HEADER_SUN,
  FIGMA_CAL_DAY_NUM,
  FIGMA_CAL_DAY_NUM_TODAY,
  FIGMA_CAL_EVENT_PILL,
  FIGMA_CAL_GRID_WRAP,
  FIGMA_CAL_HEADER,
  FIGMA_CAL_HEADER_TITLE,
  FIGMA_CAL_HEADER_YEAR,
  FIGMA_CAL_MAIN,
  FIGMA_CAL_NAV_BTN,
  FIGMA_CAL_PAGE,
  FIGMA_CAL_TODAY_BTN,
  getCalEventTypeMeta,
  monthLabel,
  weekdayLabels,
} from './figmaCalendarClasses';

export default function CalendarFigmaView({
  viewMode = 'month',
  onViewModeChange,
  events = [],
  selectedDate,
  onSelectDate,
  selectedEvent,
  onSelectEvent,
  locale = 'vi',
  t,
  onPrevMonth,
  onNextMonth,
  onToday,
  onOpenCreate,
  onRefresh,
  calendarWriteEnabled = true,
  onJoinEvent,
  selectedDateEvents = [],
  upcomingMonthEvents = [],
  onUpcomingClick,
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const year = selectedDate.getFullYear();
  const month = selectedDate.getMonth();
  const dayLabels = weekdayLabels(locale, t);

  const getEventsForKey = (key) => events.filter((e) => e.date === key);

  const renderMonthGrid = () => {
    const firstDay = new Date(year, month, 1).getDay();
    const daysInPrev = new Date(year, month, 0).getDate();
    const daysInCur = new Date(year, month + 1, 0).getDate();

    const cells = [];
    for (let i = firstDay - 1; i >= 0; i -= 1) {
      cells.push({
        date: new Date(year, month - 1, daysInPrev - i),
        currentMonth: false,
        key: `prev-${i}`,
      });
    }
    for (let d = 1; d <= daysInCur; d += 1) {
      cells.push({
        date: new Date(year, month, d),
        currentMonth: true,
        key: `cur-${d}`,
      });
    }
    while (cells.length < 42) {
      const n = cells.length - daysInCur - firstDay + 1;
      cells.push({
        date: new Date(year, month + 1, n),
        currentMonth: false,
        key: `next-${n}`,
      });
    }

    return (
      <>
        <div className="mb-1 grid grid-cols-7 gap-1">
          {dayLabels.map((label, i) => (
            <div
              key={label}
              className={`${FIGMA_CAL_DAY_HEADER} ${i === 0 ? FIGMA_CAL_DAY_HEADER_SUN : ''}`}
            >
              {label}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((cell) => {
            const key = toDateKey(cell.date);
            const dayEvents = getEventsForKey(key);
            const isToday = key === toDateKey(today);
            const isSelected = key === toDateKey(selectedDate);
            const isWeekend = cell.date.getDay() === 0 || cell.date.getDay() === 6;

            return (
              <div
                key={cell.key}
                role="button"
                tabIndex={0}
                onClick={() => onSelectDate?.(cell.date)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectDate?.(cell.date);
                  }
                }}
                className={`${FIGMA_CAL_CELL} ${FIGMA_CAL_CELL_DEFAULT} ${
                  !cell.currentMonth ? FIGMA_CAL_CELL_OUTSIDE : ''
                } ${isSelected ? FIGMA_CAL_CELL_SELECTED : isToday ? FIGMA_CAL_CELL_TODAY : ''}`}
              >
                <div
                  className={`${FIGMA_CAL_DAY_NUM} ${
                    isToday ? FIGMA_CAL_DAY_NUM_TODAY : isWeekend && cell.currentMonth ? 'text-error' : 'text-foreground'
                  }`}
                >
                  {cell.date.getDate()}
                </div>
                <div className="flex flex-col gap-0.5">
                  {dayEvents.slice(0, 2).map((ev) => {
                    const meta = getCalEventTypeMeta(ev, t);
                    return (
                      <button
                        key={ev.id}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectEvent?.(ev);
                          onSelectDate?.(cell.date);
                        }}
                        className={`${FIGMA_CAL_EVENT_PILL} ${meta.pillBg} ${meta.pillText} text-left ${meta.pillBorder}`}
                        title={ev.title}
                      >
                        {ev.time ? `${ev.time} ` : ''}
                        {ev.title}
                      </button>
                    );
                  })}
                  {dayEvents.length > 2 && (
                    <span className="pl-0.5 text-[0.6rem] text-muted-foreground">
                      {t ? t('calendar.moreEventsCompact', { n: dayEvents.length - 2 }) : `+${dayEvents.length - 2}`}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </>
    );
  };

  return (
    <div className={FIGMA_CAL_PAGE}>
      <div className={FIGMA_CAL_MAIN}>
        <header className={FIGMA_CAL_HEADER}>
          <div className="flex items-center gap-1">
            <button type="button" className={FIGMA_CAL_NAV_BTN} onClick={onPrevMonth} aria-label={t ? t('calendar.prevMonthAria') : 'Previous month'}>
              <ChevronLeft size={15} />
            </button>
            <button type="button" className={FIGMA_CAL_NAV_BTN} onClick={onNextMonth} aria-label={t ? t('calendar.nextMonthAria') : 'Next month'}>
              <ChevronRight size={15} />
            </button>
          </div>

          <h4 className={FIGMA_CAL_HEADER_TITLE}>
            {monthLabel(selectedDate, locale)}{' '}
            <span className={FIGMA_CAL_HEADER_YEAR}>{year}</span>
          </h4>

          <button type="button" className={FIGMA_CAL_TODAY_BTN} onClick={onToday}>
            {t ? t('calendar.todayNavBtn') : 'Today'}
          </button>

          <CalendarViewModeToggle value={viewMode} onChange={onViewModeChange} />

          {onRefresh && (
            <button
              type="button"
              className={FIGMA_CAL_NAV_BTN}
              onClick={onRefresh}
              title={t ? t('calendar.refresh') : 'Refresh'}
              aria-label={t ? t('calendar.refresh') : 'Refresh'}
            >
              ↻
            </button>
          )}

          <button
            type="button"
            className={`${FIGMA_CAL_CREATE_BTN}${calendarWriteEnabled ? '' : ' cursor-not-allowed opacity-50'}`}
            onClick={calendarWriteEnabled ? onOpenCreate : undefined}
            disabled={!calendarWriteEnabled}
            title={calendarWriteEnabled ? undefined : (t ? t('profile.comingSoon') : 'Coming soon')}
          >
            <Plus size={15} />
            {t ? t('calendar.createAppointmentBtn') : 'Create event'}
          </button>
        </header>

        <div className={FIGMA_CAL_GRID_WRAP}>
          {viewMode === 'month' && renderMonthGrid()}
          {viewMode === 'week' && (
            <CalendarWeekView
              events={events}
              selectedDate={selectedDate}
              onSelectDate={onSelectDate}
              locale={locale}
              t={t}
            />
          )}
          {viewMode === 'list' && (
            <CalendarListView
              events={events}
              selectedDate={selectedDate}
              onSelectDate={onSelectDate}
              onSelectEvent={onSelectEvent}
              locale={locale}
              t={t}
            />
          )}
        </div>
      </div>

      <CalendarEventSidebar
        selectedDate={selectedDate}
        events={selectedDateEvents}
        selectedEvent={selectedEvent}
        onSelectEvent={onSelectEvent}
        onOpenCreate={onOpenCreate}
        calendarWriteEnabled={calendarWriteEnabled}
        onJoinEvent={onJoinEvent}
        upcomingMonthEvents={upcomingMonthEvents}
        onUpcomingClick={onUpcomingClick}
        locale={locale}
        t={t}
        today={today}
      />
    </div>
  );
}
