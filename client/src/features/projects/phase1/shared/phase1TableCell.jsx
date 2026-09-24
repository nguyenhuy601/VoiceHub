import { formatPhase1StatusLabel, priorityBadgeClass, statusBadgeClass } from './phase1UiTokens';
import { PHASE1_TABLE_COLORS as C } from './phase1TableColors';
import { splitPhase1KeyList } from './phase1ClientTable';

const KEY_LIST_COL_IDS = new Set([
  'relatedCr',
  'relatedFr',
  'relatedBg',
  'relatedBr',
  'relatedSystems',
  'relatedArtifactIds',
  'sourceFrKey',
  'skillKeys',
  'customerReqIds',
  'customerRequirementIds',
]);

function stakeholderInitials(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase();
}

/**
 * Rich cell render for Phase 1 tables (status / priority / CR chips / stakeholder).
 */
export function renderPhase1TableCell({ col, row, display, full, t }) {
  if (col?.isStatus) {
    return (
      <span className={statusBadgeClass(row.status)}>
        {formatPhase1StatusLabel(display || row.status, t) || '—'}
      </span>
    );
  }

  if (col?.id === 'priority' || col?.isPriority) {
    const raw = String(full || display || '').trim();
    if (!raw) return '—';
    return <span className={priorityBadgeClass(raw)}>{raw}</span>;
  }

  if (col?.id === 'stakeholder') {
    const names = splitPhase1KeyList(full || display);
    if (!names.length) return '—';
    return (
      <div className="flex max-w-[14rem] flex-col gap-1">
        {names.slice(0, 3).map((name) => (
          <div key={name} className="flex min-w-0 items-center gap-1.5" title={name}>
            <span
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#D6E4FF] text-[9px] font-semibold text-[#1D39C4]"
              aria-hidden
            >
              {stakeholderInitials(name)}
            </span>
            <span className="truncate text-[12px] text-[#262626] dark:text-slate-200">{name}</span>
          </div>
        ))}
      </div>
    );
  }

  if (col?.isKeyList || KEY_LIST_COL_IDS.has(String(col?.id || ''))) {
    const keys = splitPhase1KeyList(full || display);
    if (!keys.length) return '—';
    return (
      <div className="flex max-w-[18rem] flex-wrap gap-1">
        {keys.map((k) => (
          <span key={k} className={C.keyChip} title={k}>
            {k}
          </span>
        ))}
      </div>
    );
  }

  return display || '—';
}
