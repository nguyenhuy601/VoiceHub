import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Search } from 'lucide-react';

/**
 * Tree editor: Category → Module → Master Permission actions.
 * grantsDraft: { [masterPermissionKey]: true }
 * tree: from GET /permissions/catalog → data.tree
 */
export default function MasterPermissionTreeEditor({
  tree = [],
  grantsDraft = {},
  onToggle,
  onSetMany,
  editable = true,
  searchPlaceholder = 'Tìm category / module / action…',
}) {
  const [query, setQuery] = useState('');
  const [openCategories, setOpenCategories] = useState(() => new Set(['system', 'organization', 'project']));
  const [openModules, setOpenModules] = useState(() => new Set());

  const q = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!q) return tree;
    return (tree || [])
      .map((cat) => {
        const modules = (cat.modules || [])
          .map((mod) => {
            const permissions = (mod.permissions || []).filter(
              (p) =>
                p.key.toLowerCase().includes(q) ||
                String(p.action || '').toLowerCase().includes(q) ||
                String(mod.label || '').toLowerCase().includes(q) ||
                String(cat.label || '').toLowerCase().includes(q)
            );
            if (
              !permissions.length &&
              !String(mod.label || '')
                .toLowerCase()
                .includes(q) &&
              !String(cat.label || '')
                .toLowerCase()
                .includes(q)
            ) {
              return null;
            }
            return { ...mod, permissions: permissions.length ? permissions : mod.permissions };
          })
          .filter(Boolean);
        if (!modules.length && !String(cat.label || '').toLowerCase().includes(q)) return null;
        return { ...cat, modules };
      })
      .filter(Boolean);
  }, [tree, q]);

  const toggleCategory = (key) => {
    setOpenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleModule = (key) => {
    setOpenModules((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const moduleKeys = (mod) => (mod.permissions || []).map((p) => p.key);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none"
          placeholder={searchPlaceholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        {filtered.map((cat) => {
          const catOpen = openCategories.has(cat.key) || Boolean(q);
          const allCatKeys = (cat.modules || []).flatMap(moduleKeys);
          const selectedCat = allCatKeys.filter((k) => grantsDraft[k]).length;
          return (
            <div key={cat.key} className="overflow-hidden rounded-xl border border-border bg-card/40">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-muted/30"
                onClick={() => toggleCategory(cat.key)}
              >
                <span className="flex items-center gap-2 font-semibold">
                  {catOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  {cat.label || cat.key}
                </span>
                <span className="text-xs text-muted-foreground">
                  {selectedCat}/{allCatKeys.length}
                </span>
              </button>
              {catOpen ? (
                <div className="space-y-1 border-t border-border/60 px-2 py-2">
                  {(cat.modules || []).map((mod) => {
                    const modOpen = openModules.has(mod.key) || Boolean(q);
                    const keys = moduleKeys(mod);
                    const selected = keys.filter((k) => grantsDraft[k]).length;
                    return (
                      <div key={mod.key} className="rounded-lg border border-border/50 bg-background/40">
                        <div className="flex items-center gap-2 px-2 py-1.5">
                          <button
                            type="button"
                            className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm font-medium"
                            onClick={() => toggleModule(mod.key)}
                          >
                            {modOpen ? (
                              <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                            )}
                            <span className="truncate">{mod.label || mod.key}</span>
                          </button>
                          <span className="text-[10px] text-muted-foreground">
                            {selected}/{keys.length}
                          </span>
                          {editable && onSetMany ? (
                            <button
                              type="button"
                              className="rounded border border-border px-1.5 py-0.5 text-[10px] hover:bg-muted/40"
                              onClick={() => onSetMany(keys, selected < keys.length)}
                            >
                              {selected >= keys.length ? 'Bỏ' : 'Tất cả'}
                            </button>
                          ) : null}
                        </div>
                        {modOpen ? (
                          <ul className="space-y-1 border-t border-border/40 px-2 py-2">
                            {(mod.permissions || []).map((perm) => {
                              const on = Boolean(grantsDraft[perm.key]);
                              return (
                                <li key={perm.key}>
                                  <label
                                    className={`flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-sm ${
                                      editable ? 'hover:bg-muted/30' : 'opacity-80'
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      className="mt-0.5"
                                      checked={on}
                                      disabled={!editable}
                                      onChange={() => onToggle?.(perm.key)}
                                    />
                                    <span>
                                      <span className="font-medium">{perm.label || perm.action}</span>
                                      <span className="mt-0.5 block font-mono text-[10px] text-muted-foreground">
                                        {perm.key}
                                      </span>
                                    </span>
                                  </label>
                                </li>
                              );
                            })}
                          </ul>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
        {!filtered.length ? (
          <p className="rounded-xl border border-border bg-card/40 p-4 text-sm text-muted-foreground">
            Không có permission khớp bộ lọc.
          </p>
        ) : null}
      </div>
    </div>
  );
}
