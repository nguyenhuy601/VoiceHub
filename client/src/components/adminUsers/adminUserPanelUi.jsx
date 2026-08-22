/**
 * Shell + form card dùng chung cho các màn admin Users (enterprise).
 */
export function AdminUserPanelShell({ title, hint, actions, children, wide = false }) {
  return (
    <div className={`mx-auto space-y-5 ${wide ? 'max-w-[1400px]' : 'max-w-5xl'}`}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-foreground">{title}</h2>
          {hint ? <p className="mt-1 text-sm text-muted-foreground">{hint}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      {children}
    </div>
  );
}

export function AdminUserFormCard({ title, hint, children, danger = false, isDarkMode = false }) {
  const titleCls = isDarkMode ? 'text-white' : 'text-foreground';
  const muted = isDarkMode ? 'text-slate-300' : 'text-muted-foreground';
  const cardCls = isDarkMode
    ? danger
      ? 'border-red-500/40 bg-[#11141C]'
      : 'border-slate-700 bg-[#11141C]'
    : danger
      ? 'border-red-500/30 bg-card'
      : 'border-border bg-card';
  return (
    <div className={`rounded-xl border p-5 shadow-sm ${cardCls}`}>
      {title ? <h3 className={`text-base font-semibold ${titleCls}`}>{title}</h3> : null}
      {hint ? <p className={`mt-1 text-sm ${muted}`}>{hint}</p> : null}
      <div className={title || hint ? 'mt-4' : ''}>{children}</div>
    </div>
  );
}

export function adminPrimaryBtnClass(extra = '') {
  return `inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50 ${extra}`;
}

export function adminSecondaryBtnClass(extra = '', isDarkMode = false) {
  const tone = isDarkMode
    ? 'border-slate-600 bg-[#1A1A1C] text-slate-100 hover:bg-slate-800/80'
    : 'border-border bg-card text-foreground hover:bg-muted/40';
  return `inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${tone} ${extra}`;
}

export function adminDangerBtnClass(extra = '') {
  return `inline-flex items-center justify-center gap-2 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-600 transition hover:bg-red-500/15 dark:text-red-400 disabled:cursor-not-allowed disabled:opacity-50 ${extra}`;
}

export function adminInputClass(extra = '') {
  return `w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-red-500/30 focus:ring-2 ${extra}`;
}

export function adminLabelClass() {
  return 'mb-1.5 block text-xs font-medium text-muted-foreground';
}
