/**
 * Agent Core P5 — optional LangGraph interrupt for Gate HITL preview.
 * Default OFF — production Gate1/2 remain project-service HTTP (RULE-F2-03).
 * When AGENT_CORE_HITL_INTERRUPT=1, graph pauses with interrupt() for resume.
 */

const { interrupt } = require('@langchain/langgraph');

function isHitlInterruptEnabled(env = process.env) {
  const raw = String(env.AGENT_CORE_HITL_INTERRUPT ?? '0').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'on';
}

/**
 * Pause graph for human gate review (LangGraph interrupt).
 * @param {{ gate: 'gate1'|'gate2', runId?: string, snapshotId?: string, summary?: object }} payload
 */
function awaitHumanGate(payload = {}) {
  if (!isHitlInterruptEnabled()) {
    return { skipped: true, gate: payload.gate || null };
  }
  return interrupt({
    type: 'human_gate',
    gate: payload.gate || 'gate2',
    runId: payload.runId || null,
    snapshotId: payload.snapshotId || null,
    summary: payload.summary || null,
    at: new Date().toISOString(),
  });
}

module.exports = {
  isHitlInterruptEnabled,
  awaitHumanGate,
};
