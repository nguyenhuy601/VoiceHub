/**
 * WHAT tool helpers for whatPhaseGraph (ReAct + Pattern B).
 */

const { deepMergePlanningContainers } = require('../tools/mergePlanningContainers');
const { CANONICAL_ORDER } = require('./whatToolDag');
const { WHAT_FR_TOOL } = require('../whatSecs/sectionCatalog');
const { applyProposalFragment } = require('../srsProposal/srsProposalReducer');
const { createEmptySrsProposal, isSrsProposal } = require('../srsProposal/srsProposalSchema');
const { buildFoundationUnderstanding, applyFoundationToProposal } = require('../srsProposal/foundation');
const { mergeSectionDeriveResult } = require('../semantic/applyRawSectionDerive');

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function appendList(left, right) {
  const base = Array.isArray(left) ? left : [];
  if (right == null) return base;
  return base.concat(Array.isArray(right) ? right : [right]);
}

function mergeStopReason(left, right) {
  return left || right || null;
}

function mergeCurrentToolName(left, right) {
  if (!left) return right || null;
  if (!right || left === right) return left;
  const names = new Set(String(`${left}|${right}`).split('|').filter(Boolean));
  return [...names].join('|');
}

/**
 * Merge parallel srsProposal patches by section (siblings keep their writes).
 * @param {object|null|undefined} left
 * @param {object|null|undefined} right
 */
function mergeSrsProposalPatches(left, right) {
  if (right == null) return left;
  if (left == null) return right;
  if (!isPlainObject(left) || !isPlainObject(right)) return right;

  const out = { ...left, ...right };
  const leftGen = isPlainObject(left.generated) ? left.generated : {};
  const rightGen = isPlainObject(right.generated) ? right.generated : {};
  const gen = { ...leftGen };
  for (const key of Object.keys(rightGen)) {
    const rSec = rightGen[key];
    const lSec = leftGen[key];
    if (!isPlainObject(rSec)) {
      gen[key] = rSec;
      continue;
    }
    const rItems = Array.isArray(rSec.items) ? rSec.items : [];
    const lItems = isPlainObject(lSec) && Array.isArray(lSec.items) ? lSec.items : [];
    // Prefer non-empty section write from either side
    if (rItems.length || !lItems.length) {
      gen[key] = { ...(isPlainObject(lSec) ? lSec : {}), ...rSec };
    } else {
      gen[key] = lSec;
    }
  }
  out.generated = gen;

  if (isPlainObject(left.meta) || isPlainObject(right.meta)) {
    out.meta = { ...(left.meta || {}), ...(right.meta || {}) };
  }
  if (isPlainObject(left.completeness) || isPlainObject(right.completeness)) {
    out.completeness = { ...(left.completeness || {}), ...(right.completeness || {}) };
  }
  return out;
}

function mergeEngineResultsById(left, right) {
  if (right == null) return left || {};
  return { ...(left && typeof left === 'object' ? left : {}), ...right };
}

function mergeSemanticStatuses(left, right) {
  if (right == null) return left || {};
  return { ...(left && typeof left === 'object' ? left : {}), ...right };
}

function ensureProposal(state) {
  if (isSrsProposal(state.srsProposal)) return state.srsProposal;
  let proposal = createEmptySrsProposal({ source: 'what_tool_dag' });
  if (
    state.proposalFragment?.section === 'functionalRequirements' &&
    Array.isArray(state.proposalFragment.items) &&
    state.proposalFragment.items.length
  ) {
    proposal = applyProposalFragment(proposal, state.proposalFragment, {
      bumpProposalVersion: true,
      generationId: state.proposalFragment?.meta?.generationId || state.runId,
    });
  }
  const foundation = buildFoundationUnderstanding({
    rawRecord: state.pack?.aiAnalysis?.analyses?.customerRawRecord || null,
    snapshot: state.snapshot || null,
  });
  return applyFoundationToProposal(proposal, foundation);
}

/**
 * Sparse container patch (same idea as HOW) — analyses.srsProposal atomic when present.
 */
function sparseContainerPatch(base, next) {
  if (!isPlainObject(next)) return null;
  const patch = {};
  for (const key of Object.keys(next)) {
    if (key === 'jobs') continue;
    const nextVal = next[key];
    const baseVal = base?.[key];
    if (nextVal === baseVal) continue;
    if (key === 'analyses' && isPlainObject(nextVal) && isPlainObject(baseVal)) {
      const analyses = {};
      for (const child of Object.keys(nextVal)) {
        if (nextVal[child] === baseVal[child]) continue;
        analyses[child] = nextVal[child];
      }
      if (Object.keys(analyses).length) patch.analyses = analyses;
      continue;
    }
    if (key === 'phaseRuns' && isPlainObject(nextVal) && isPlainObject(baseVal)) {
      const phaseRuns = {};
      for (const child of Object.keys(nextVal)) {
        if (nextVal[child] === baseVal[child]) continue;
        phaseRuns[child] = nextVal[child];
      }
      if (Object.keys(phaseRuns).length) patch.phaseRuns = phaseRuns;
      continue;
    }
    patch[key] = nextVal;
  }
  return Object.keys(patch).length ? patch : null;
}

function shouldSkipWhatTool(state, toolName) {
  const stop = String(state?.stopReason || '');
  if (stop.startsWith('BUDGET_') || stop === 'TOOL_FAILED') return true;
  if (state?.paused) return true;
  const results = Array.isArray(state?.toolResults) ? state.toolResults : [];
  if (results.some((row) => row?.error)) return true;
  if (results.some((row) => row?.toolName === toolName && !row.error)) return true;
  if (state?.selective) {
    const names = Array.isArray(state.selectiveToolNames) ? state.selectiveToolNames : [];
    if (!names.includes(toolName)) return true;
  }
  const index = CANONICAL_ORDER.indexOf(toolName);
  const startIndex = Number(state?.startIndex) || 0;
  if (!state?.selective && index >= 0 && index < startIndex) return true;
  return false;
}

function applyFrToolToState(state, frSem) {
  const proposalFragment = frSem?.proposalFragment || null;
  let proposal = ensureProposal(state);
  if (
    proposalFragment?.section === 'functionalRequirements' &&
    Array.isArray(proposalFragment.items) &&
    proposalFragment.items.length
  ) {
    proposal = applyProposalFragment(proposal, proposalFragment, {
      bumpProposalVersion: true,
      generationId: proposalFragment?.meta?.generationId || state.runId || null,
    });
  } else if (
    proposalFragment?.section === 'functionalRequirements' &&
    Array.isArray(proposalFragment.items) &&
    !proposalFragment.items.length
  ) {
    // Empty FR fragment: keep existing proposal FR or seed from pack intake.
    const existing = proposal.generated?.functionalRequirements?.items || [];
    const packFr = Array.isArray(state.pack?.functionalRequirements)
      ? state.pack.functionalRequirements
      : [];
    if (!existing.length && packFr.length) {
      proposal = applyProposalFragment(
        proposal,
        {
          section: 'functionalRequirements',
          items: packFr,
          relations: proposalFragment.relations || [],
          clarificationQuestions: proposalFragment.clarificationQuestions || [],
          backlogStructure: proposalFragment.backlogStructure || undefined,
          meta: {
            ...(proposalFragment.meta || {}),
            seededFromPack: true,
            frDecomposeSkipped: proposalFragment.meta?.frDecomposeSkipped,
          },
        },
        {
          bumpProposalVersion: true,
          generationId: proposalFragment?.meta?.generationId || state.runId || null,
        }
      );
    } else if (proposalFragment.backlogStructure) {
      proposal.generated = {
        ...(proposal.generated || {}),
        backlogStructure: proposalFragment.backlogStructure,
      };
    }
  }
  const resultsById = { ...(state.engineResultsById || {}) };
  resultsById.fr = {
    execution: { status: 'SUCCESS', diagnostics: [] },
    items: proposalFragment?.items || frSem?.items || [],
    coverage: proposalFragment?.meta?.coverage || frSem?.coverage || null,
    validation: { errors: [], warnings: [] },
    meta: { engineId: 'fr', fromTool: WHAT_FR_TOOL },
  };
  return {
    srsProposal: proposal,
    proposalFragment,
    frUnderstanding: frSem?.frUnderstanding || null,
    conflictAmbiguityGate: frSem?.conflictAmbiguityGate || null,
    requirementIntegrityGate:
      frSem?.requirementIntegrityGate || frSem?.conflictAmbiguityGate || null,
    contextPackage:
      frSem?.g4Out?.contextPackage ||
      frSem?.meta?.g4Out?.contextPackage ||
      state.contextPackage ||
      null,
    corpusContentHash: frSem?.g4Out?.corpusContentHash || frSem?.meta?.g4Out?.corpusContentHash || null,
    engineResultsById: { fr: resultsById.fr },
    semanticStatuses: { fr: frSem?.status || 'run' },
  };
}

function applySectionToolToState(state, engineId, result) {
  let proposal = ensureProposal(state);
  const resultsById = { ...(state.engineResultsById || {}) };
  const merged = mergeSectionDeriveResult(proposal, resultsById, engineId, result || {});
  return {
    srsProposal: merged.proposal,
    engineResultsById: resultsById[engineId] ? { [engineId]: resultsById[engineId] } : {},
    semanticStatuses: merged.status != null ? { [engineId]: merged.status } : {},
  };
}

/**
 * @param {Array<{ toolName?: string, error?: object }>|null|undefined} toolResults
 * @returns {Error|null}
 */
function whatToolFailure(toolResults) {
  const failed = (Array.isArray(toolResults) ? toolResults : []).filter((row) => row?.error);
  if (!failed.length) return null;
  const names = failed.map((row) => row.toolName || 'tool').join(', ');
  const err = new Error(
    failed
      .map((row) => {
        const name = row.toolName || 'tool';
        const message = String(row.error?.message || '').trim();
        return message ? `${name}: ${message}` : name;
      })
      .join('; ')
  );
  err.code = 'WHAT_TOOL_FAILED';
  err.toolNames = names;
  err.failedTools = failed;
  return err;
}

module.exports = {
  appendList,
  mergeStopReason,
  mergeCurrentToolName,
  mergeSrsProposalPatches,
  mergeEngineResultsById,
  mergeSemanticStatuses,
  sparseContainerPatch,
  deepMergePlanningContainers,
  shouldSkipWhatTool,
  ensureProposal,
  applyFrToolToState,
  applySectionToolToState,
  whatToolFailure,
};
