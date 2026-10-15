/**
 * Hybrid HITL — LangGraph interrupt for **in-run** interactions only (RULE-H2).
 * Gate 1/2 legal approval stays on project-service HTTP + Mongo Pack (RULE-H1 / RULE-F2-03).
 *
 * Kinds: clarify | edit_draft
 * Default OFF — AGENT_CORE_HITL_INTERRUPT=0
 */

const { interrupt } = require('@langchain/langgraph');

const IN_RUN_KINDS = Object.freeze(['clarify', 'edit_draft']);

function isHitlInterruptEnabled(env = process.env) {
  const raw = String(env.AGENT_CORE_HITL_INTERRUPT ?? '0').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'on' || raw === 'yes';
}

/**
 * @param {string} raw
 * @returns {string} normalized kind (may be unknown)
 */
function normalizeInRunKind(raw) {
  const k = String(raw || '').trim().toLowerCase();
  if (k === 'edit_draft' || k === 'edit' || k === 'review_edit') return 'edit_draft';
  if (k === 'clarify' || k === 'ask_user' || k === 'respond') return 'clarify';
  return k;
}

function isInRunHitlKind(raw) {
  return IN_RUN_KINDS.includes(normalizeInRunKind(raw));
}

/**
 * Pause graph for short-lived in-run HITL (Ask User / Review-Edit draft).
 * Does **not** stamp Gate 1/2.
 *
 * @param {{
 *   kind?: 'clarify'|'edit_draft',
 *   runId?: string,
 *   snapshotId?: string,
 *   summary?: object,
 *   prompt?: string,
 * }} payload
 */
function awaitInRunHitl(payload = {}) {
  const rawKind = normalizeInRunKind(payload.kind);
  const kind = isInRunHitlKind(rawKind) ? rawKind : 'clarify';
  if (!isHitlInterruptEnabled()) {
    return { skipped: true, kind, type: 'in_run_hitl' };
  }
  return interrupt({
    type: 'in_run_hitl',
    kind,
    runId: payload.runId || null,
    snapshotId: payload.snapshotId || null,
    summary: payload.summary || null,
    prompt: payload.prompt || null,
    at: new Date().toISOString(),
  });
}

/**
 * @deprecated Use awaitInRunHitl — gate1/gate2 strings are not legal Gate SoT.
 * Maps legacy gate preview to in-run edit_draft only.
 */
function awaitHumanGate(payload = {}) {
  const gate = String(payload.gate || '').trim().toLowerCase();
  if (gate === 'gate1' || gate === 'gate2') {
    return awaitInRunHitl({
      kind: 'edit_draft',
      runId: payload.runId,
      snapshotId: payload.snapshotId,
      summary: {
        ...(payload.summary && typeof payload.summary === 'object' ? payload.summary : {}),
        legacyGatePreview: gate,
        note: 'Not a governance Gate stamp — Pack HTTP remains SoT',
      },
      prompt: payload.prompt,
    });
  }
  return awaitInRunHitl({
    kind: payload.kind || 'clarify',
    runId: payload.runId,
    snapshotId: payload.snapshotId,
    summary: payload.summary,
    prompt: payload.prompt,
  });
}

module.exports = {
  IN_RUN_KINDS,
  isHitlInterruptEnabled,
  normalizeInRunKind,
  isInRunHitlKind,
  awaitInRunHitl,
  awaitHumanGate,
};
