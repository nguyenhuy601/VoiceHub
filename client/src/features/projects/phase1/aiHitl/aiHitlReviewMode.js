/**
 * Which Review panel to show — never surface stale Gate1 while WHAT is in-flight.
 * RULE-R01: Data Gate is not a business HITL mode (legacy waiting_human:data_review → idle).
 */

export function resolveAiHitlReviewMode(pack, liveRun) {
  const liveStatus = String(liveRun?.status || '');
  const gate = String(liveRun?.gate || '');
  // Legacy Data Gate pause — do not open Pass/Reject panel (cleanup via revise/start WHAT)
  if (liveStatus === 'waiting_human' && gate === 'data_review') {
    return 'idle';
  }

  const packStatus = String(pack?.status || '');
  const phaseWhat = pack?.aiAnalysis?.phaseRuns?.phase_what;
  const whatStatus = String(phaseWhat?.status || '');

  if (
    whatStatus === 'pending' ||
    liveStatus === 'queued' ||
    liveStatus === 'running' ||
    liveStatus === 'replanning'
  ) {
    return 'idle';
  }

  const whatReady =
    whatStatus === 'ready' || Boolean(pack?.aiAnalysis?.analyses?.srsProposal);
  const gate1Approved = packStatus === 'approved' || packStatus === 'project_linked';

  if (gate1Approved) return 'gate2';
  if (whatReady || packStatus === 'under_review' || packStatus === 'draft') {
    if (whatReady || packStatus === 'under_review') return 'gate1';
  }
  return 'idle';
}

export default resolveAiHitlReviewMode;
