/**
 * Reconcile candidates with approved baseline + current draft + user edits.
 * Does NOT match on title or sourceFrIds alone.
 * Ambiguous → NEEDS_REVIEW (no keep/mint publish for that entity).
 */

const { RECONCILE_DECISIONS } = require('./constants');

function normText(raw) {
  return String(raw || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function frSetKey(ids = []) {
  return [...new Set((ids || []).map(String).filter(Boolean))].sort().join('|');
}

function behaviorKey(entity) {
  const cd = entity?.classificationDecision || {};
  return [
    normText(cd.behavior || cd.summary || entity.title || entity.name),
    normText(cd.beneficiary || cd.actor || ''),
    frSetKey(entity.sourceFrIds),
    frSetKey(entity.acRefs),
  ].join('::');
}

function scoreMatch(candidate, baseline) {
  const sameFr = frSetKey(candidate.sourceFrIds) === frSetKey(baseline.sourceFrIds) && frSetKey(candidate.sourceFrIds);
  const sameAc = frSetKey(candidate.acRefs) === frSetKey(baseline.acRefs);
  const sameBehavior =
    normText(candidate.classificationDecision?.behavior || candidate.classificationDecision?.summary) ===
      normText(baseline.classificationDecision?.behavior || baseline.classificationDecision?.summary) &&
    normText(candidate.classificationDecision?.behavior || candidate.classificationDecision?.summary).length > 0;
  const titleOnly =
    normText(candidate.title) === normText(baseline.title || baseline.name) &&
    normText(candidate.title).length > 0;

  let score = 0;
  if (sameBehavior) score += 4;
  if (sameFr && sameBehavior) score += 3;
  if (sameAc && sameBehavior) score += 2;
  if (sameFr && !sameBehavior) score += 1; // weak — not enough alone
  if (titleOnly && !sameBehavior) score += 0; // title alone never conclusive

  let decision = RECONCILE_DECISIONS.NEW;
  if (score >= 7) decision = RECONCILE_DECISIONS.KEEP;
  else if (score >= 4 && sameFr && sameBehavior) decision = RECONCILE_DECISIONS.KEEP;
  else if (score >= 2 && score < 7) decision = RECONCILE_DECISIONS.NEEDS_REVIEW;
  else if (sameFr && !sameBehavior) decision = RECONCILE_DECISIONS.NEEDS_REVIEW;
  else decision = RECONCILE_DECISIONS.NEW;

  return { score, decision, sameFr: Boolean(sameFr), sameBehavior, titleOnly };
}

function collectBaselineEntities(baseline = {}, draft = {}) {
  const byKind = { epic: [], feature: [], story: [] };
  for (const src of [baseline, draft]) {
    if (!src || typeof src !== 'object') continue;
    for (const e of src.epics || []) byKind.epic.push({ ...e, _kind: 'epic' });
    for (const f of src.features || []) byKind.feature.push({ ...f, _kind: 'feature' });
    for (const s of src.stories || []) byKind.story.push({ ...s, _kind: 'story' });
  }
  return byKind;
}

/**
 * @param {object} candidates — normalized from acceptBacklogCandidates
 * @param {{ approvedBaseline?: object, currentDraft?: object, userEdits?: object }} ctx
 */
function reconcileBacklogBaseline(candidates = {}, ctx = {}) {
  const baselinePool = collectBaselineEntities(ctx.approvedBaseline, ctx.currentDraft);
  // Prefer user edit overlays (same id wins)
  if (ctx.userEdits && typeof ctx.userEdits === 'object') {
    for (const e of ctx.userEdits.epics || []) baselinePool.epic.push({ ...e, _kind: 'epic', _userEdit: true });
    for (const f of ctx.userEdits.features || []) {
      baselinePool.feature.push({ ...f, _kind: 'feature', _userEdit: true });
    }
    for (const s of ctx.userEdits.stories || []) baselinePool.story.push({ ...s, _kind: 'story', _userEdit: true });
  }

  const identityReview = [];
  const decisions = { epics: [], features: [], stories: [] };
  let needsReview = false;

  function reconcileList(list, kind, pool) {
    const usedBaselineIds = new Set();
    for (const cand of list) {
      let best = null;
      for (const base of pool) {
        if (usedBaselineIds.has(base.id)) continue;
        const scored = scoreMatch(cand, base);
        if (!best || scored.score > best.scored.score) {
          best = { base, scored };
        }
      }

      if (!best || best.scored.decision === RECONCILE_DECISIONS.NEW) {
        decisions[kind].push({
          tempId: cand.tempId,
          decision: RECONCILE_DECISIONS.NEW,
          keepId: null,
          candidate: cand,
        });
        continue;
      }

      if (best.scored.decision === RECONCILE_DECISIONS.NEEDS_REVIEW) {
        needsReview = true;
        identityReview.push({
          tempId: cand.tempId,
          kind: kind.replace(/s$/, ''),
          reason: 'ambiguous_baseline_match',
          candidateTitle: cand.title,
          baselineId: best.base.id,
          score: best.scored.score,
        });
        decisions[kind].push({
          tempId: cand.tempId,
          decision: RECONCILE_DECISIONS.NEEDS_REVIEW,
          keepId: null,
          candidate: cand,
          ambiguousBaselineId: best.base.id,
        });
        continue;
      }

      // KEEP
      usedBaselineIds.add(best.base.id);
      decisions[kind].push({
        tempId: cand.tempId,
        decision: RECONCILE_DECISIONS.KEEP,
        keepId: best.base.id,
        candidate: cand,
        baseline: best.base,
      });
    }
  }

  reconcileList(candidates.epics || [], 'epics', baselinePool.epic);
  reconcileList(candidates.features || [], 'features', baselinePool.feature);
  reconcileList(candidates.stories || [], 'stories', baselinePool.story);

  return {
    ok: true,
    needsReview,
    identityReview,
    decisions,
    // Publishable only when no pending review
    canPublish: !needsReview,
  };
}

/**
 * Apply explicit human/LLM review resolutions then re-run decisions for those tempIds.
 * @param {object} reconcileResult
 * @param {Array<{ tempId: string, action: 'KEEP'|'NEW'|'SPLIT'|'MERGE', keepId?: string }>} resolutions
 */
function applyIdentityReviewResolutions(reconcileResult, resolutions = []) {
  const byTemp = new Map((resolutions || []).map((r) => [String(r.tempId), r]));
  const next = {
    ...reconcileResult,
    identityReview: [],
    decisions: {
      epics: [...(reconcileResult.decisions?.epics || [])],
      features: [...(reconcileResult.decisions?.features || [])],
      stories: [...(reconcileResult.decisions?.stories || [])],
    },
  };

  function patch(kind) {
    next.decisions[kind] = next.decisions[kind].map((d) => {
      if (d.decision !== RECONCILE_DECISIONS.NEEDS_REVIEW) return d;
      const res = byTemp.get(d.tempId);
      if (!res) {
        next.identityReview.push({
          tempId: d.tempId,
          kind: kind.replace(/s$/, ''),
          reason: 'still_pending_review',
        });
        return d;
      }
      const action = String(res.action || '').toUpperCase();
      if (action === 'KEEP' && res.keepId) {
        return { ...d, decision: RECONCILE_DECISIONS.KEEP, keepId: res.keepId };
      }
      if (action === 'NEW') {
        return { ...d, decision: RECONCILE_DECISIONS.NEW, keepId: null };
      }
      if (action === 'SPLIT' || action === 'MERGE') {
        return {
          ...d,
          decision: action,
          keepId: null,
          lineage: {
            derivedFromStoryIds: res.derivedFromStoryIds || res.derivedFromIds || [],
            supersedes: res.supersedes || [],
          },
        };
      }
      next.identityReview.push({
        tempId: d.tempId,
        kind: kind.replace(/s$/, ''),
        reason: 'invalid_resolution',
      });
      return d;
    });
  }

  patch('epics');
  patch('features');
  patch('stories');
  next.needsReview = next.identityReview.length > 0;
  next.canPublish = !next.needsReview;
  return next;
}

module.exports = {
  reconcileBacklogBaseline,
  applyIdentityReviewResolutions,
  scoreMatch,
  behaviorKey,
};
