/**
 * Detect WBS staged checkpoint + revision/stale badges from pack.aiAnalysis.
 */

export function getPlanningSlice(pack) {
  const aa = pack?.aiAnalysis && typeof pack.aiAnalysis === 'object' ? pack.aiAnalysis : {};
  return aa.planning && typeof aa.planning === 'object' ? aa.planning : {};
}

export function getWbsBaselineRevisionId(pack) {
  const id = getPlanningSlice(pack).wbsBaselineRevisionId;
  return id ? String(id) : null;
}

export function getCurrentWbsRevisionId(pack) {
  const planning = getPlanningSlice(pack);
  if (planning.currentRevisionIds?.wbs) return String(planning.currentRevisionIds.wbs);
  const list = planning.revisions?.wbs;
  if (!Array.isArray(list) || !list.length) return null;
  const tip = [...list].reverse().find((r) => r?.status === 'current');
  return tip?.revisionId ? String(tip.revisionId) : null;
}

export function getHowRemoteRunId(pack) {
  const phaseHow = pack?.aiAnalysis?.phaseRuns?.phase_how || {};
  return String(phaseHow.remoteRunId || phaseHow.runId || '').trim() || null;
}

/**
 * Waiting for human WBS confirm (soft hitl on container or missing baseline with leaves).
 */
export function isWaitingWbsConfirm(pack) {
  const aa = pack?.aiAnalysis || {};
  const hitl = aa.hitl || aa.phaseRuns?.phase_how?.hitl || null;
  if (
    hitl &&
    (hitl.kind === 'wbs_confirm' || hitl?.waiting) &&
    String(hitl.kind || '') === 'wbs_confirm'
  ) {
    return true;
  }
  const planning = getPlanningSlice(pack);
  if (planning.wbsBaselineRevisionId) return false;
  const tasks = Array.isArray(planning.tasks) ? planning.tasks : [];
  const hasLeaves = tasks.some((t) => t && (t.level === 'task' || t.type === 'task'));
  const phaseHow = aa.phaseRuns?.phase_how || {};
  const howRunning =
    ['running', 'waiting_human', 'callback_pending'].includes(String(phaseHow.status || '')) ||
    Boolean(phaseHow.remoteRunId);
  return Boolean(hasLeaves && howRunning && !planning.wbsBaselineRevisionId && getCurrentWbsRevisionId(pack));
}

export function getArtifactStaleMap(pack) {
  const stale = getPlanningSlice(pack).artifactStale;
  return stale && typeof stale === 'object' ? stale : {};
}

export function getLatestChangeEvents(pack, limit = 5) {
  const events = getPlanningSlice(pack).changeEvents;
  if (!Array.isArray(events)) return [];
  return events.slice(-limit).reverse();
}

export function getPlanManifest(pack) {
  const aa = pack?.aiAnalysis || {};
  return (
    aa.planManifest ||
    aa.phaseRuns?.phase_how?.planManifest ||
    aa.completeness?.planManifest ||
    null
  );
}
