import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppStrings } from '../../../../locales/appStrings';
import { Phase1ColumnsTriggerButton } from '../shared/Phase1DataTableChrome';
import {
  clearVisibleColumnIds,
  getArtifactListColumnCatalog,
  getDefaultVisibleColumnIds,
  saveVisibleColumnIds,
} from './artifactListColumns';

/**
 * DEC R1 — curated default columns + picker for Excel-aligned extras.
 */
export default function ArtifactColumnPicker({ kind, visibleIds, onChange }) {
  const { t } = useAppStrings();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  const catalog = useMemo(() => getArtifactListColumnCatalog(kind), [kind]);
  const defaults = useMemo(() => getDefaultVisibleColumnIds(kind), [kind]);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const toggle = (id) => {
    if (id === 'id') return;
    const set = new Set(visibleIds);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    const next = catalog.map((c) => c.id).filter((cid) => set.has(cid));
    if (!next.includes('id')) next.unshift('id');
    onChange(next);
    saveVisibleColumnIds(kind, next);
  };

  const reset = () => {
    onChange(defaults);
    clearVisibleColumnIds(kind);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative">
      <Phase1ColumnsTriggerButton
        label={t('workspace.phase1ColumnsPicker')}
        expanded={open}
        onClick={() => setOpen((v) => !v)}
      />
      {open ? (
        <div
          className="absolute right-0 z-30 mt-1 max-h-72 w-64 overflow-y-auto rounded-lg border border-border bg-card p-2 shadow-lg"
          role="listbox"
        >
          <p className="mb-2 px-1 text-[11px] text-muted-foreground">
            {t('workspace.phase1ColumnsPickerHint')}
          </p>
          <ul className="space-y-0.5">
            {catalog.map((c) => {
              const checked = visibleIds.includes(c.id);
              const locked = c.id === 'id';
              return (
                <li key={c.id}>
                  <label
                    className={`flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-muted/50 ${
                      locked ? 'opacity-70' : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="rounded border-border"
                      checked={checked}
                      disabled={locked}
                      onChange={() => toggle(c.id)}
                    />
                    <span className="truncate">{t(c.labelKey)}</span>
                    {c.defaultVisible === false ? (
                      <span className="ml-auto shrink-0 text-[10px] text-muted-foreground" aria-hidden="true">
                        +
                      </span>
                    ) : null}
                  </label>
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            className="mt-2 w-full rounded border border-border px-2 py-1 text-xs hover:bg-muted/50"
            onClick={reset}
          >
            {t('workspace.phase1ColumnsPickerReset')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
