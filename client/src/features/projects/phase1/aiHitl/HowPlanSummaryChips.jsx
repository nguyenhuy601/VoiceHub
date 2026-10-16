/**
 * HOW plan alert chips — chỉ hiện tín hiệu cần chú ý (không dump mọi count).
 * Reads resolveHowPlanSummary only (HARD-03: no invented numbers).
 */

import { resolveHowPlanSummary } from './howPlanSummary';

function labelOf(t, key, fallback, vars) {
  const value = typeof t === 'function' ? t(key, vars) : '';
  if (value) return value;
  if (!vars) return fallback;
  return Object.entries(vars).reduce(
    (text, [name, raw]) => text.replace(`{${name}}`, String(raw ?? '')),
    fallback
  );
}

/**
 * @param {object} props
 * @param {object|null} [props.pack]
 * @param {function} props.t
 */
export default function HowPlanSummaryChips({ pack = null, t }) {
  const summary = resolveHowPlanSummary(pack);
  if (!summary.hasSummary) return null;

  const dc = summary.deadlineConflict;
  const conflictCount = Number(summary.conflictCount) || 0;
  const unassignedCount = Number(summary.unassignedCount) || 0;
  const qualityWarn = summary.qualityPlanOk === false;
  const deployWarn = summary.deployPlanOk === false;
  const hasAlerts =
    conflictCount > 0 || unassignedCount > 0 || Boolean(dc) || qualityWarn || deployWarn;
  if (!hasAlerts) return null;

  return (
    <div className="mt-3 flex flex-wrap gap-3 text-xs font-medium text-amber-800 dark:text-amber-200">
      {conflictCount > 0 ? (
        <span>
          {labelOf(t, 'requirements.gate2ConflictCount', 'Conflicts')}: {conflictCount}
        </span>
      ) : null}
      {unassignedCount > 0 ? (
        <span>
          {labelOf(t, 'requirements.gate2UnassignedCount', 'Unassigned')}: {unassignedCount}
        </span>
      ) : null}
      {qualityWarn ? (
        <span>
          {labelOf(t, 'requirements.gate2QualityPlanCount', 'Testing plan')}:{' '}
          {labelOf(t, 'requirements.gate2PlanIncomplete', 'incomplete')}
        </span>
      ) : null}
      {deployWarn ? (
        <span>
          {labelOf(t, 'requirements.gate2DeployPlanCount', 'Deploy plan')}:{' '}
          {labelOf(t, 'requirements.gate2PlanIncomplete', 'incomplete')}
        </span>
      ) : null}
      {dc ? (
        <span>
          {labelOf(t, 'requirements.gate2Deadline', 'Deadline')}: {dc.deadline || '—'} ·{' '}
          {labelOf(t, 'requirements.gate2EstimatedEnd', 'Est. end')}: {dc.estimatedEnd || '—'}
        </span>
      ) : null}
    </div>
  );
}
