import { useState } from 'react';

function slugKey(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 32);
}

/**
 * Danh sách key/label: sửa label, xóa dòng, thêm dòng mới.
 */
export default function CatalogKeyLabelEditor({
  items = [],
  disabled = false,
  addKeyPh = 'key',
  addLabelPh = 'Label',
  addText = 'Add',
  emptyText = '',
  deleteAria = 'Delete',
  cannotDeleteLast = true,
  onChange,
}) {
  const [draftKey, setDraftKey] = useState('');
  const [draftLabel, setDraftLabel] = useState('');
  const rows = Array.isArray(items) ? items : [];

  const emit = (next) => onChange?.(next);

  const addRow = () => {
    const key = slugKey(draftKey);
    if (!key || disabled) return;
    if (rows.some((r) => String(r.key) === key)) return;
    emit([...rows, { key, label: String(draftLabel || key).trim() || key }]);
    setDraftKey('');
    setDraftLabel('');
  };

  return (
    <div className="space-y-2">
      {rows.length ? (
        <ul className="space-y-2">
          {rows.map((row, idx) => (
            <li key={row.key || idx} className="flex items-center gap-2">
              <span className="w-28 shrink-0 truncate font-mono text-xs text-muted-foreground" title={row.key}>
                {row.key}
              </span>
              <input
                className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
                value={row.label || ''}
                disabled={disabled}
                onChange={(e) => {
                  const next = rows.map((r, i) => (i === idx ? { ...r, label: e.target.value } : r));
                  emit(next);
                }}
              />
              <button
                type="button"
                className="shrink-0 rounded-md border border-destructive/40 px-2 py-1 text-xs font-semibold text-destructive disabled:opacity-40"
                disabled={disabled || (cannotDeleteLast && rows.length <= 1)}
                aria-label={deleteAria}
                onClick={() => emit(rows.filter((_, i) => i !== idx))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : emptyText ? (
        <p className="text-xs text-muted-foreground">{emptyText}</p>
      ) : null}
      <div className="flex flex-wrap items-end gap-2">
        <input
          className="w-28 rounded-md border border-border bg-background px-2 py-1.5 font-mono text-xs outline-none focus:border-primary"
          value={draftKey}
          disabled={disabled}
          placeholder={addKeyPh}
          onChange={(e) => setDraftKey(e.target.value)}
        />
        <input
          className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
          value={draftLabel}
          disabled={disabled}
          placeholder={addLabelPh}
          onChange={(e) => setDraftLabel(e.target.value)}
        />
        <button
          type="button"
          className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
          disabled={disabled || !slugKey(draftKey)}
          onClick={addRow}
        >
          {addText}
        </button>
      </div>
    </div>
  );
}
