/**
 * Editor for dated allocation segments (start/end + %).
 * Empty segments = no saved plan yet (do not invent a phantom 100% row).
 * Client-side overlap warning when same-day total > 100%.
 */

export function toDateInput(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

/** First segment when user explicitly adds a time range. */
export function createDefaultAllocSegment() {
  return {
    startDate: toDateInput(new Date()),
    endDate: '',
    allocationPct: 100,
  };
}

export default function AllocationSegmentsEditor({
  segments = [],
  onChange,
  disabled = false,
  isDarkMode = false,
  t,
  /** Optional: peer projects for multi-project timeline hint */
  peerProjects = [],
}) {
  const muted = isDarkMode ? 'text-slate-300' : 'text-muted-foreground';
  const titleCls = isDarkMode ? 'text-slate-100' : 'text-foreground';
  const inputCls = isDarkMode
    ? 'w-full rounded-lg border border-slate-600 bg-[#1A1A1C] px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-primary [color-scheme:dark]'
    : 'w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary';

  const rows = Array.isArray(segments) ? segments : [];
  const isEmpty = rows.length === 0;

  const updateRow = (index, key, value) => {
    const next = rows.map((row, i) => (i === index ? { ...row, [key]: value } : row));
    onChange?.(next);
  };

  const addRow = () => {
    if (isEmpty) {
      onChange?.([createDefaultAllocSegment()]);
      return;
    }
    onChange?.([...rows, { startDate: '', endDate: '', allocationPct: 50 }]);
  };

  const removeRow = (index) => {
    if (rows.length <= 1) {
      onChange?.([]);
      return;
    }
    onChange?.(rows.filter((_, i) => i !== index));
  };

  const localOver = !isEmpty && isLocallyOverallocated(rows);
  const peerLines = Array.isArray(peerProjects) ? peerProjects : [];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className={`text-xs font-semibold uppercase tracking-wide ${muted}`}>
          {t('workspace.projectHubAllocSegments')}
        </p>
        {!disabled ? (
          <button
            type="button"
            onClick={addRow}
            className="text-[11px] font-semibold text-primary"
          >
            {t('workspace.projectHubAllocAddSegment')}
          </button>
        ) : null}
      </div>
      {isEmpty ? (
        <div
          className={`rounded-lg border border-dashed border-border px-3 py-3 text-[11px] leading-snug ${muted}`}
          role="status"
        >
          <p className={`font-medium ${titleCls}`}>
            {t('workspace.projectHubAllocEmptyTitle')}
          </p>
          <p className="mt-1">{t('workspace.projectHubAllocEmptyHint')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((row, index) => (
            <div
              key={`alloc-${index}`}
              className="grid gap-2 sm:grid-cols-[1fr_1fr_90px_auto]"
            >
              <label className={`block text-[11px] ${muted}`}>
                {t('workspace.projectHubAllocStart')}
                <input
                  type="date"
                  className={`${inputCls} mt-0.5`}
                  value={row.startDate || ''}
                  disabled={disabled}
                  onChange={(e) => updateRow(index, 'startDate', e.target.value)}
                />
              </label>
              <label className={`block text-[11px] ${muted}`}>
                {t('workspace.projectHubAllocEnd')}
                <input
                  type="date"
                  className={`${inputCls} mt-0.5`}
                  value={row.endDate || ''}
                  disabled={disabled}
                  onChange={(e) => updateRow(index, 'endDate', e.target.value)}
                />
              </label>
              <label className={`block text-[11px] ${muted}`}>
                %
                <input
                  type="number"
                  min={0}
                  max={100}
                  className={`${inputCls} mt-0.5`}
                  value={row.allocationPct ?? ''}
                  disabled={disabled}
                  onChange={(e) => updateRow(index, 'allocationPct', e.target.value)}
                />
              </label>
              {!disabled ? (
                <button
                  type="button"
                  onClick={() => removeRow(index)}
                  className="self-end pb-1.5 text-xs text-destructive"
                  aria-label={t('workspace.projectHubAllocRemoveSegment')}
                >
                  ×
                </button>
              ) : (
                <span />
              )}
            </div>
          ))}
        </div>
      )}
      {localOver ? (
        <p className={`rounded-md border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-[11px] ${
          isDarkMode ? 'text-red-400' : 'text-red-700'
        }`}>
          {t('workspace.projectHubAllocLocalOverWarn')}
        </p>
      ) : null}
      {peerLines.length ? (
        <div
          className={`rounded-md border px-2.5 py-1.5 text-[11px] ${muted} ${
            isDarkMode ? 'border-slate-600 bg-slate-800/50' : 'border-border bg-muted/30'
          }`}
        >
          <p className={`mb-1 font-semibold ${titleCls}`}>
            {t('workspace.projectHubAllocTimeline')}
          </p>
          <ul className="space-y-0.5">
            {peerLines.map((p) => (
              <li key={p.projectId} className="truncate">
                {p.projectCode ? `${p.projectCode} — ` : ''}
                {p.title || p.projectId}
                {p.allocationStatus === 'overallocated' ? ' ⚠' : ''}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/** Sweep within editor rows — any day > 100%. */
export function isLocallyOverallocated(segments = []) {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const events = [];
  for (const s of segments || []) {
    if (!s?.startDate) continue;
    const start = Date.parse(`${s.startDate}T00:00:00.000Z`);
    if (!Number.isFinite(start)) continue;
    let end = Number.POSITIVE_INFINITY;
    if (s.endDate) {
      const e = Date.parse(`${s.endDate}T00:00:00.000Z`);
      if (Number.isFinite(e)) end = e + DAY_MS;
    }
    const pct = Number(s.allocationPct);
    if (!Number.isFinite(pct) || pct <= 0) continue;
    events.push({ t: start, delta: pct });
    events.push({ t: end, delta: -pct });
  }
  events.sort((a, b) => a.t - b.t || a.delta - b.delta);
  let running = 0;
  for (const ev of events) {
    running += ev.delta;
    if (running > 100.0001) return true;
  }
  return false;
}

export function segmentsFromApi(allocations = []) {
  return (Array.isArray(allocations) ? allocations : []).map((s) => ({
    startDate: toDateInput(s.startDate),
    endDate: toDateInput(s.endDate),
    allocationPct: s.allocationPct ?? 100,
  }));
}

export function segmentsToPayload(segments = []) {
  return (Array.isArray(segments) ? segments : [])
    .map((s) => ({
      startDate: s.startDate || null,
      endDate: s.endDate || null,
      allocationPct: Number(s.allocationPct),
    }))
    .filter((s) => s.startDate && Number.isFinite(s.allocationPct));
}
