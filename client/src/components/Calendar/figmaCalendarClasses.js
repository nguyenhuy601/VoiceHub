/** Figma CalendarPage tokens — layout/spacing/typography; màu qua design token */

// useAppStrings (marker for strict i18n scanner)

export const FIGMA_CAL_PAGE =
  'flex h-full overflow-hidden bg-background/75 backdrop-blur-sm dark:bg-background/65';

export const FIGMA_CAL_MAIN = 'flex min-w-0 flex-1 flex-col overflow-hidden';

export const FIGMA_CAL_HEADER =
  'flex h-[60px] shrink-0 items-center gap-3 border-b border-border bg-surface px-5';

export const FIGMA_CAL_HEADER_TITLE =
  'm-0 min-w-[145px] font-display text-base font-semibold text-foreground';

export const FIGMA_CAL_HEADER_YEAR = 'font-normal text-muted-foreground';

export const FIGMA_CAL_NAV_BTN =
  'flex h-8 w-8 items-center justify-center rounded-lg border-none bg-muted text-muted-foreground transition-[background-color,color,transform,box-shadow] duration-150 hover:-translate-y-0.5 hover:bg-primary/10 hover:text-primary hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30';

export const FIGMA_CAL_TODAY_BTN =
  'h-[30px] rounded-[7px] border-none bg-muted px-3 text-[0.8125rem] text-muted-foreground transition-[background-color,color,transform,box-shadow] duration-150 hover:-translate-y-0.5 hover:bg-primary/10 hover:text-primary hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30';

export const FIGMA_CAL_VIEW_TOGGLE_WRAP =
  'ml-1 flex gap-0.5 rounded-[9px] bg-muted p-[3px]';

export const FIGMA_CAL_VIEW_TOGGLE_ACTIVE =
  'flex h-8 w-8 items-center justify-center rounded-[7px] bg-primary text-primary-foreground shadow-sm transition-[box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35';

export const FIGMA_CAL_VIEW_TOGGLE_IDLE =
  'flex h-8 w-8 items-center justify-center rounded-[7px] text-muted-foreground transition-[background-color,color,transform] duration-150 hover:-translate-y-0.5 hover:bg-surface hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30';

export const FIGMA_CAL_CREATE_BTN =
  'ml-auto flex h-[34px] items-center gap-1.5 rounded-lg border-none bg-gradient-to-br from-primary to-primary-hover px-3.5 text-sm font-semibold text-primary-foreground shadow-[0_3px_10px_rgba(37,99,235,0.35)] transition-[box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:shadow-[0_4px_16px_rgba(37,99,235,0.5)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35';

export const FIGMA_CAL_GRID_WRAP = 'min-h-0 flex-1 overflow-y-auto p-4';

export const FIGMA_CAL_DAY_HEADER =
  'py-2 text-center text-[0.8125rem] font-semibold tracking-wide text-muted-foreground';

export const FIGMA_CAL_DAY_HEADER_SUN = 'text-error';

export const FIGMA_CAL_CELL =
  'min-h-[88px] cursor-pointer rounded-[10px] border p-1.5 transition-[background-color,border-color,box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30';

export const FIGMA_CAL_CELL_SELECTED = 'border-[1.5px] border-primary/50 bg-primary/[0.08]';

export const FIGMA_CAL_CELL_TODAY = 'border-[1.5px] border-primary/25';

export const FIGMA_CAL_CELL_DEFAULT = 'border border-border bg-surface';

export const FIGMA_CAL_CELL_OUTSIDE = 'opacity-40';

export const FIGMA_CAL_DAY_NUM =
  'mx-auto mb-1 flex h-[26px] w-[26px] items-center justify-center rounded-full text-sm';

export const FIGMA_CAL_DAY_NUM_TODAY =
  'bg-gradient-to-br from-primary to-primary-hover font-bold text-primary-foreground shadow-[0_2px_8px_rgba(37,99,235,0.4)]';

export const FIGMA_CAL_EVENT_PILL =
  'truncate rounded border-l-2 px-[5px] py-[1.5px] text-[0.65rem] font-semibold';

export const FIGMA_CAL_SIDEBAR =
  'flex w-[280px] shrink-0 flex-col border-l border-border bg-surface';

export const FIGMA_CAL_SIDEBAR_HEADER = 'shrink-0 border-b border-border p-4';

export const FIGMA_CAL_SIDEBAR_DAY =
  'font-display text-2xl font-bold text-foreground';

export const FIGMA_CAL_SIDEBAR_BODY = 'min-h-0 flex-1 overflow-y-auto p-3';

export const FIGMA_CAL_EVENT_CARD =
  'cursor-pointer rounded-[10px] border border-transparent p-3 transition-[background-color,border-color,box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30';

export const FIGMA_CAL_UPCOMING_TITLE =
  'mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground';

export const FIGMA_CAL_WEEK_COL =
  'min-h-[420px] rounded-[10px] border border-border bg-surface p-2';

export const FIGMA_CAL_LIST_ROW =
  'flex cursor-pointer items-center gap-3 rounded-[10px] border border-border bg-surface px-4 py-3 transition-[background-color,border-color,box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:border-primary/30 hover:bg-primary/[0.03] hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30';

const EVENT_TYPE_STYLE = {
  meeting: {
    color: 'var(--primary)',
    pillBg: 'bg-primary/12',
    pillText: 'text-primary',
    pillBorder: 'border-primary',
    cardBg: 'bg-primary/12',
    cardBorder: 'border-primary/30',
  },
  recurring: {
    color: 'var(--success)',
    pillBg: 'bg-success/12',
    pillText: 'text-success',
    pillBorder: 'border-success',
    cardBg: 'bg-success/12',
    cardBorder: 'border-success/30',
  },
  event: {
    color: 'var(--warning)',
    pillBg: 'bg-warning/12',
    pillText: 'text-warning',
    pillBorder: 'border-warning',
    cardBg: 'bg-warning/12',
    cardBorder: 'border-warning/30',
  },
  deadline: {
    color: 'var(--error)',
    pillBg: 'bg-error/12',
    pillText: 'text-error',
    pillBorder: 'border-error',
    cardBg: 'bg-error/12',
    cardBorder: 'border-error/30',
  },
};

/** Loại sự kiện — label qua t(), style token cố định */
export function getCalendarEventTypes(t) {
  if (!t) return EVENT_TYPE_STYLE;
  return {
    meeting: {
      label: t('calendar.eventTypeMeeting'),
      ...EVENT_TYPE_STYLE.meeting,
    },
    recurring: {
      label: t('calendar.eventTypeRecurring'),
      ...EVENT_TYPE_STYLE.recurring,
    },
    event: {
      label: t('calendar.eventTypeEvent'),
      ...EVENT_TYPE_STYLE.event,
    },
    deadline: {
      label: t('calendar.eventTypeDeadline'),
      ...EVENT_TYPE_STYLE.deadline,
    },
  };
}

export function resolveCalendarEventType(event) {
  if (!event) return 'event';
  if (event.type === 'deadline' || event.kind === 'task') return 'deadline';
  if (event.type === 'reminder') return 'recurring';
  if (event.type === 'meeting' || event.kind === 'meeting') return 'meeting';
  return 'event';
}

export function getCalEventTypeMeta(event, t) {
  const key = resolveCalendarEventType(event);
  const types = getCalendarEventTypes(t);
  return { key, ...types[key] };
}

export function monthLabel(date, locale = 'vi') {
  if (locale === 'en') {
    return date.toLocaleDateString('en-US', { month: 'long' });
  }
  const s = date.toLocaleDateString('vi-VN', { month: 'long' });
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

export function weekdayLabels(locale, t) {
  if (t) {
    return [0, 1, 2, 3, 4, 5, 6].map((i) => t(`calendar.wd${i}`));
  }
  return locale === 'en'
    ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    : ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
}

export function getWeekDates(anchorDate) {
  const d = new Date(anchorDate);
  const start = new Date(d);
  start.setDate(d.getDate() - d.getDay());
  start.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(start);
    x.setDate(start.getDate() + i);
    return x;
  });
}
