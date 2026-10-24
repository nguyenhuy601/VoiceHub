/**
 * WHAT section tool — deterministic prefill, then fact→propose→accept graph.
 * The model is not asked to assign ids or counts.
 */

const { createEvidence } = require('../evidence/evidence');
const { runWhatSectionGraph } = require('../whatSecs/sectionGraph');
const { WHAT_TOOL_BY_ENGINE } = require('../whatSecs/sectionCatalog');
const { SECTION_BY_ENGINE } = require('../semantic/sectionDeriveRegistry');
const {
  isLlmDeriveSectionLocked,
  isCustomerRawIntakePack,
  hasRawDeriveSource,
  isRawSectionDeriveEnabled,
} = require('../semantic/rawSectionDerivePolicy');
const { existingSheetRows } = require('../semantic/runRawSectionDerive');
const { TASK_POLICIES } = require('../semantic/semanticTaskRegistry');
const { buildActorsFromRaw, buildScopeFromRaw } = require('../srsProposal/engines/actorsFromRaw');

function emptySkip(section, reason) {
  return {
    status: TASK_POLICIES.SKIP,
    reason,
    items: [],
    llmCalls: 0,
    coverage: { status: reason === 'SHEET_PRESENT' ? 'AVAILABLE' : 'NO_DATA', reason },
    section,
  };
}

function prefillWithoutLlm(engineId, pack, env, snapshot) {
  if (engineId === 'scope') return buildScopeFromRaw(pack, env, { snapshot });
  if (engineId === 'actors') return buildActorsFromRaw(pack, env);
  return null;
}

/**
 * @param {string} engineId
 * @param {object} input
 * @param {object} context
 */
async function runWhatSectionTool(engineId, input = {}, context = {}) {
  const section = SECTION_BY_ENGINE[engineId];
  const pack = context.pack || input.pack || {};
  const env = input.env || context.env || process.env;
  const proposal = input.proposal || context.proposal || null;
  const snapshot = input.snapshot || context.snapshot || null;
  const toolName = WHAT_TOOL_BY_ENGINE[engineId] || `What${engineId}Tool`;

  let derive = null;
  if (
    !isRawSectionDeriveEnabled(env) ||
    !isCustomerRawIntakePack(pack) ||
    !hasRawDeriveSource(pack)
  ) {
    derive = emptySkip(section, 'RAW_DERIVE_NOT_APPLICABLE');
  } else if (isLlmDeriveSectionLocked(engineId, env)) {
    derive = emptySkip(section, 'DERIVE_LOCKED');
  } else {
    const proposalItems = proposal?.generated?.[section]?.items;
    const sheetRows = existingSheetRows(engineId, pack);
    const customerRaw = isCustomerRawIntakePack(pack);
    if (Array.isArray(proposalItems) && proposalItems.length) {
      derive = emptySkip(section, 'SHEET_PRESENT');
    } else if (!customerRaw && Array.isArray(sheetRows) && sheetRows.length) {
      derive = emptySkip(section, 'SHEET_PRESENT');
    } else {
      const prefill = prefillWithoutLlm(engineId, pack, env, snapshot);
      if (prefill && Array.isArray(prefill.items) && prefill.items.length) {
        derive = {
          status: TASK_POLICIES.RUN,
          reason: prefill.coverage?.reason || 'EXTRACT',
          items: prefill.items,
          llmCalls: 0,
          coverage: prefill.coverage || { status: 'AVAILABLE', reason: 'EXTRACT' },
          section,
        };
      } else {
        derive = await runWhatSectionGraph({
          engineId,
          pack,
          env,
          proposal,
          g4Understanding: input.g4Understanding || context.g4Understanding || null,
          evidence: input.evidence || context.evidence || null,
          snapshot,
          locale: input.locale || context.locale || pack?.aiAnalysis?.deriveLocale || null,
          contextPackage: input.contextPackage || context.contextPackage || null,
          invokeFn: input.invokeFn || context.invokeFn || null,
        });
      }
    }
  }

  const items = Array.isArray(derive?.items) ? derive.items : [];
  return {
    result: {
      engineId,
      section,
      ...derive,
      items,
    },
    evidence: [
      createEvidence({
        sourceType: 'raw_section_derive',
        sourceId: engineId,
        snapshotId: input.snapshotId || context.snapshotId || null,
        metric: 'candidate_count',
        value: items.length,
        unit: 'count',
        calculatedBy: toolName,
        ruleId: 'WHAT-SEC-TOOL-LLM-001',
      }),
    ],
  };
}

module.exports = { runWhatSectionTool };
