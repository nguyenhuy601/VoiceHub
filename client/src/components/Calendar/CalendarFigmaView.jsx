import { useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Plus, RefreshCw } from 'lucide-react';
import { toDateKey } from '../../utils/calendarUtils';
import { resolveCalendarGridNav } from '../../utils/calendarGridNav';
import { adminSecondaryBtnClass } from '../adminUsers/adminUserPanelUi';
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
  loading = false,
  error = null,
  onRetry,
}) {
  const gridRef = useRef(null);
  const pendingFocusKeyRef = useRef('');
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const year = selectedDate.getFullYear();
  const month = selectedDate.getMonth();
  const dayLabels = weekdayLabels(locale, t);

  const getEventsForKey = (key) => events.filter((e) => e.date === key);
  const selectedKey = toDateKey(selectedDate);
  const todayKey = toDateKey(today);
  const dayLabelFormatter = new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'vi-VN', { dateStyle: 'full' });

  useEffect(() => {
    const pendingKey = pendingFocusKeyRef.current;
    if (!pendingKey) return;
    pendingFocusKeyRef.current = '';
    gridRef.current?.querySelector(`[data-date-key="${pendingKey}"]`)?.focus();
  }, [selectedKey]);

  const handleDayKeyDown = (e, dateKey) => {
    const nav = resolveCalendarGridNav(dateKey, e.key);
    if (!nav) return;
    e.preventDefault();
    const [y, m, d] = nav.dateKey.split('-').map(Number);
    pendingFocusKeyRef.current = nav.dateKey;
    onSelectDate?.(new Date(y, m - 1, d));
  };

  const dayAriaLabel = (date, count) => {
    const label = dayLabelFormatter.format(date);
    if (!t) return label;
    return count > 0
      ? t('calendar.dayCellAria', { date: label, count })
      : t('calendar.dayCellNoEvents', { date: label });
  };

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

    const rows = Array.from({ length: cells.length / 7 }, (_, r) => cells.slice(r * 7, r * 7 + 7));

    return (
      <div
        ref={gridRef}
        role="grid"
        aria-label={t ? t('calendar.gridAria', { month: `${monthLabel(selectedDate, locale)} ${year}` }) : undefined}
        className="flex flex-col gap-1"
      >
        <div role="row" className="mb-1 grid grid-cols-7 gap-1">
          {dayLabels.map((label, i) => (
            <div
              key={label}
              role="columnheader"
              className={`${FIGMA_CAL_DAY_HEADER} ${i === 0 ? FIGMA_CAL_DAY_HEADER_SUN : ''}`}
            >
              {label}
            </div>
          ))}
        </div>
        {rows.map((row) => (
          <div key={row[0].key} role="row" className="grid grid-cols-7 gap-1">
            {row.map((cell) => {
              const key = toDateKey(cell.date);
              const dayEvents = getEventsForKey(key);
              const isToday = key === todayKey;
              const isSelected = key === selectedKey;
              const isWeekend = cell.date.getDay() === 0 || cell.date.getDay() === 6;

              return (
                <div
                  key={cell.key}
                  role="gridcell"
                  aria-selected={isSelected}
                  className={`relative ${FIGMA_CAL_CELL} ${FIGMA_CAL_CELL_DEFAULT} ${
                    !cell.currentMonth ? FIGMA_CAL_CELL_OUTSIDE : ''
                  } ${isSelected ? FIGMA_CAL_CELL_SELECTED : isToday ? FIGMA_CAL_CELL_TODAY : ''}`}
                >
                  <button
                    type="button"
                    data-date-key={key}
                    tabIndex={isSelected ? 0 : -1}
                    aria-label={dayAriaLabel(cell.date, dayEvents.length)}
                    aria-current={isToday ? 'date' : undefined}
                    onClick={() => onSelectDate?.(cell.date)}
                    onKeyDown={(e) => handleDayKeyDown(e, key)}
                    className="absolute inset-0 rounded-[10px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  />
                  <div
                    aria-hidden="true"
                    className={`pointer-events-none relative ${FIGMA_CAL_DAY_NUM} ${
                      isToday ? FIGMA_CAL_DAY_NUM_TODAY : isWeekend && cell.currentMonth ? 'text-error' : 'text-foreground'
                    }`}
                  >
                    {cell.date.getDate()}
                  </div>
                  <div className="relative flex flex-col gap-0.5">
                    {dayEvents.slice(0, 2).map((ev) => {
                      const meta = getCalEventTypeMeta(ev, t);
                      return (
                        <button
                          key={ev.id}
                          type="button"
                          tabIndex={-1}
                          onClick={() => {
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
                      <span aria-hidden="true" className="pointer-events-none pl-0.5 text-[0.6rem] text-muted-foreground">
                        {t ? t('calendar.moreEventsCompact', { n: dayEvents.length - 2 }) : `+${dayEvents.length - 2}`}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    );
  };

  const renderGridSkeleton = () => (
    <div className="grid grid-cols-7 gap-1" aria-hidden="true">
      {Array.from({ length: 42 }, (_, i) => (
        <div key={i} className="min-h-[88px] rounded-[10px] bg-muted motion-safe:animate-pulse" />
      ))}
    </div>
  );

  const showViewContent = !loading && (!error || events.length > 0);

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
              <RefreshCw size={15} aria-hidden="true" />
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
          {loading ? (
            <div role="status" aria-live="polite">
              <span className="sr-only">{t ? t('calendar.feedLoading') : 'Loading…'}</span>
              {renderGridSkeleton()}
            </div>
          ) : null}
          {error && !loading ? (
            <div
              role="alert"
              className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive motion-safe:animate-fade-in-fast"
            >
              <span className="min-w-0 flex-1">
                {t ? t('calendar.loadFail') : 'Could not load calendar'}
                {error ? ` — ${error}` : ''}
              </span>
              {onRetry ? (
                <button type="button" onClick={onRetry} className={adminSecondaryBtnClass('shrink-0')}>
                  <RefreshCw size={14} aria-hidden="true" />
                  {t ? t('common.retry') : 'Retry'}
                </button>
              ) : null}
            </div>
          ) : null}
          {showViewContent && viewMode === 'month' && renderMonthGrid()}
          {showViewContent && viewMode === 'week' && (
            <CalendarWeekView
              events={events}
              selectedDate={selectedDate}
              onSelectDate={onSelectDate}
              onSelectEvent={onSelectEvent}
              selectedEvent={selectedEvent}
              locale={locale}
              t={t}
            />
          )}
          {showViewContent && viewMode === 'list' && (
            <CalendarListView
              events={events}
              selectedDate={selectedDate}
              onSelectDate={onSelectDate}
              onSelectEvent={onSelectEvent}
              selectedEvent={selectedEvent}
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
        loading={loading}
      />
    </div>
  );
}
