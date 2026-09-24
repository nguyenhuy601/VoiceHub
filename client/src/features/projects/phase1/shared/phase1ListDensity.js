/** Dense list + soft light-blue thead (slightly deeper than toolbar). */

export const PHASE1_DENSE_ROW =
  'cursor-pointer transition-colors odd:bg-[#F5F7FA] even:bg-white dark:odd:bg-slate-900/70 dark:even:bg-slate-950 hover:bg-[#E6F4FF] dark:hover:bg-sky-950/35';

export const PHASE1_DENSE_CELL =
  'px-3 py-2.5 text-[13px] leading-snug text-[#262626] dark:text-slate-100';

export const PHASE1_DENSE_HEAD =
  'px-3 py-2.5 text-[11px] font-semibold tracking-wide text-[#1E3A4C] dark:text-sky-100';

export const PHASE1_DENSE_ROW_SELECTED =
  'bg-[#E6F4FF] hover:bg-[#BAE0FF] ring-1 ring-inset ring-[#91CAFF] odd:bg-[#E6F4FF] even:bg-[#E6F4FF] dark:bg-sky-950/45 dark:odd:bg-sky-950/45 dark:even:bg-sky-950/45';

/** Row currently open in edit popup — amber wash (mock “đang sửa”). */
export const PHASE1_DENSE_ROW_EDITING =
  'bg-[#FFF7E6] hover:bg-[#FFECC7] ring-1 ring-inset ring-[#FFD591] odd:bg-[#FFF7E6] even:bg-[#FFF7E6] dark:bg-amber-950/40 dark:odd:bg-amber-950/40 dark:even:bg-amber-950/40';

export const PHASE1_TABLE = 'w-full min-w-max border-collapse text-left';

/** Light-blue thead — #C9DFF0, only a step deeper than toolbar #E8F4FC. */
export const PHASE1_TH =
  `${PHASE1_DENSE_HEAD} whitespace-nowrap border-b border-[#A8C8DE] bg-[#C9DFF0] dark:border-sky-800 dark:bg-sky-900/55`;

export const PHASE1_TH_STICKY =
  `${PHASE1_TH} sticky left-0 z-20 shadow-[2px_0_0_0_rgba(168,200,222,0.85)]`;

export const PHASE1_TD =
  `${PHASE1_DENSE_CELL} border-b border-[#E8E8E8] dark:border-slate-700 align-top`;

export const PHASE1_TD_STICKY =
  `${PHASE1_TD} sticky left-0 z-[1] bg-inherit shadow-[2px_0_0_0_rgba(232,232,232,0.95)]`;

export const PHASE1_TABLE_SHELL =
  'min-h-0 flex-1 overflow-auto rounded-t-lg bg-white dark:bg-slate-950 [scrollbar-gutter:stable]';

export const PHASE1_TABLE_FRAME =
  'flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[#D9D9D9] bg-white shadow-sm dark:border-slate-700 dark:bg-slate-950';
