/**
 * Read-only module → permission rows for catalog browse.
 */
export function PermissionModuleSections({
  modules = [],
  emptyLabel,
  resolveLabel,
}) {
  if (!modules.length) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <div className="space-y-3">
      {modules.map((mod) => {
        const perms = Array.isArray(mod.permissions) ? mod.permissions : [];
        return (
          <article
            key={mod.key || mod.label}
            className="overflow-hidden rounded-xl border border-border bg-background/80 shadow-sm"
          >
            <div className="flex items-center justify-between gap-2 border-b border-border/60 bg-muted/40 px-3 py-2">
              <h4 className="text-sm font-semibold text-foreground">{mod.label || mod.key}</h4>
              <span className="text-[11px] tabular-nums text-muted-foreground">{perms.length}</span>
            </div>
            <ul className="divide-y divide-border/50">
              {perms.map((p) => {
                const code = p.key || p.code;
                const label = p.label || (resolveLabel ? resolveLabel(code) : code);
                return (
                  <li
                    key={code}
                    className="flex flex-col gap-0.5 px-3 py-2.5 transition-colors hover:bg-muted/30 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3"
                  >
                    <span className="text-sm font-medium text-foreground">{label}</span>
                    <code className="shrink-0 rounded-md bg-muted/80 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:text-[11px]">
                      {code}
                    </code>
                  </li>
                );
              })}
            </ul>
          </article>
        );
      })}
    </div>
  );
}

/**
 * Editable module → permission rows (checkbox + optional trailing control).
 */
export function PermissionModuleGrantSections({
  modules = [],
  emptyLabel,
  resolveLabel,
  isOn,
  onToggle,
  renderTrailing,
}) {
  if (!modules.length) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <div className="space-y-3">
      {modules.map((mod) => {
        const perms = Array.isArray(mod.permissions) ? mod.permissions : [];
        return (
          <article
            key={mod.key || mod.label}
            className="overflow-hidden rounded-xl border border-border bg-background/80 shadow-sm"
          >
            <div className="flex items-center justify-between gap-2 border-b border-border/60 bg-muted/40 px-3 py-2">
              <h4 className="text-sm font-semibold text-foreground">{mod.label || mod.key}</h4>
              <span className="text-[11px] tabular-nums text-muted-foreground">{perms.length}</span>
            </div>
            <ul className="divide-y divide-border/50">
              {perms.map((perm) => {
                const on = Boolean(isOn?.(perm.key));
                const label = perm.label || (resolveLabel ? resolveLabel(perm.key) : perm.key);
                return (
                  <li
                    key={perm.key}
                    className={`flex flex-wrap items-center gap-2 px-3 py-2.5 transition-colors ${
                      on ? 'bg-primary-subtle/50' : 'hover:bg-muted/30'
                    }`}
                  >
                    <label className="flex min-w-[12rem] flex-1 cursor-pointer items-start gap-2.5">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 rounded border-border accent-primary"
                        checked={on}
                        onChange={() => onToggle?.(perm.key)}
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-foreground">{label}</span>
                        <code className="mt-0.5 inline-block rounded bg-muted/80 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                          {perm.key}
                        </code>
                      </span>
                    </label>
                    {renderTrailing?.(perm, on)}
                  </li>
                );
              })}
            </ul>
          </article>
        );
      })}
    </div>
  );
}
