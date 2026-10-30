/**
 * Detect FR staged checkpoint (WHAT, always-on) from pack.aiAnalysis.
 */

export function getRequirementsSlice(pack) {
  const aa = pack?.aiAnalysis && typeof pack.aiAnalysis === 'object' ? pack.aiAnalysis : {};
  return aa.requirements && typeof aa.requirements === 'object' ? aa.requirements : {};
}

export function getFrBaselineRevisionId(pack) {
  const id = getRequirementsSlice(pack).frBaselineRevisionId;
  return id ? String(id) : null;
}

export function getCurrentFrRevisionId(pack) {
  const requirements = getRequirementsSlice(pack);
  if (requirements.currentRevisionIds?.fr) return String(requirements.currentRevisionIds.fr);
  const list = requirements.revisions?.fr;
  if (!Array.isArray(list) || !list.length) return null;
  const tip = [...list].reverse().find((r) => r?.status === 'current');
  return tip?.revisionId ? String(tip.revisionId) : null;
}

export function getWhatRemoteRunId(pack) {
  const phaseWhat = pack?.aiAnalysis?.phaseRuns?.phase_what || {};
  return String(phaseWhat.remoteRunId || phaseWhat.runId || '').trim() || null;
}

function hasFrContent(pack) {
  const aa = pack?.aiAnalysis || {};
  const proposal = aa.analyses?.srsProposal || aa.srsProposal || null;
  const items = proposal?.generated?.functionalRequirements?.items;
  if (Array.isArray(items) && items.length > 0) return true;
  const packFr = pack?.functionalRequirements;
  if (Array.isArray(packFr) && packFr.length > 0) return true;
  return Boolean(getCurrentFrRevisionId(pack));
}

/**
 * Waiting for human FR confirm (soft hitl or missing baseline with FR content).
 */
export function isWaitingFrConfirm(pack) {
  const aa = pack?.aiAnalysis || {};
  const hitl = aa.hitl || aa.phaseRuns?.phase_what?.hitl || null;
  if (hitl && String(hitl.kind || '') === 'fr_confirm' && (hitl.waiting || hitl.kind)) {
    if (!getFrBaselineRevisionId(pack)) return true;
  }
  if (getFrBaselineRevisionId(pack)) return false;
  if (!hasFrContent(pack)) return false;
  const phaseWhat = aa.phaseRuns?.phase_what || {};
  const whatRunning =
    ['running', 'waiting_human', 'callback_pending', 'incomplete'].includes(
      String(phaseWhat.status || '')
    ) || Boolean(phaseWhat.remoteRunId);
  return Boolean(whatRunning && getCurrentFrRevisionId(pack));
}

export function getLatestFrChangeEvents(pack, limit = 5) {
  const events = getRequirementsSlice(pack).changeEvents;
  if (!Array.isArray(events)) return [];
  return events.slice(-limit).reverse();
}
