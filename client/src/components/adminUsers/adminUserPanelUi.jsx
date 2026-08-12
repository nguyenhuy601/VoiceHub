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

export function AdminUserFormCard({ title, hint, children, danger = false }) {
  return (
    <div
      className={`rounded-xl border bg-card p-5 shadow-sm ${
        danger ? 'border-red-500/30' : 'border-border'
      }`}
    >
      {title ? <h3 className="text-base font-semibold text-foreground">{title}</h3> : null}
      {hint ? <p className="mt-1 text-sm text-muted-foreground">{hint}</p> : null}
      <div className={title || hint ? 'mt-4' : ''}>{children}</div>
    </div>
  );
}

export function adminPrimaryBtnClass(extra = '') {
  return `inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50 ${extra}`;
}

export function adminSecondaryBtnClass(extra = '') {
  return `inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-50 ${extra}`;
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
