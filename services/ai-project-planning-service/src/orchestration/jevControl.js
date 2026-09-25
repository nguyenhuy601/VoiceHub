/**
 * JEV control layer (P7) — provider-agnostic advisory (RULE-12).
 * Does NOT replace G13, tools, or Gate auto-approve.
 * Enable: JEV_CONTROL=1
 */

function isJevControlEnabled(env = process.env) {
  const raw = String(env.JEV_CONTROL ?? '0').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'on';
}

/**
 * JEV1 — RAG / context confidence before Gate1 (advisory).
 * @returns {{ ok: boolean, score: number, reason: string, kind: 'jev1' }}
 */
function evaluateJev1Context({ contextPackage, citations } = {}) {
  const list = Array.isArray(citations)
    ? citations
    : Array.isArray(contextPackage?.citations)
      ? contextPackage.citations
      : [];
  if (list.length === 0) {
    return { kind: 'jev1', ok: false, score: 0, reason: 'no_citations' };
  }
  const scores = list.map((c) => Number(c.score) || 0);
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  const ok = avg >= 0.15 && list.length >= 1;
  return {
    kind: 'jev1',
    ok,
    score: Math.round(avg * 1000) / 1000,
    reason: ok ? 'context_ok' : 'low_relevance',
    citationCount: list.length,
  };
}

/**
 * JEV2 — model route hint for G17 (advisory).
 * @returns {{ kind: 'jev2', route: 'small'|'reasoning', reason: string }}
 */
function evaluateJev2ModelRoute({ riskLevel, complexity } = {}) {
  const risk = String(riskLevel || complexity || '').toLowerCase();
  if (risk === 'high' || risk === 'critical' || Number(complexity) >= 0.7) {
    return { kind: 'jev2', route: 'reasoning', reason: 'high_risk_or_complexity' };
  }
  return { kind: 'jev2', route: 'small', reason: 'default_small' };
}

/**
 * JEV3 — supervisor hint for G8 evaluate (advisory; never flips G13).
 * @returns {{ kind: 'jev3', suggest: 'CONTINUE'|'RETRIEVE'|'NEED_TOOL', confidence: number, reason: string }}
 */
function evaluateJev3Supervisor({
  evaluate,
  contextPackage,
  toolResults,
} = {}) {
  const enough = evaluate?.enoughInfoToContinue !== false;
  const citations = Array.isArray(contextPackage?.citations)
    ? contextPackage.citations
    : [];
  const tools = Array.isArray(toolResults) ? toolResults : [];

  if (!enough && citations.length === 0) {
    return {
      kind: 'jev3',
      suggest: 'RETRIEVE',
      confidence: 0.7,
      reason: 'not_enough_no_citations',
    };
  }
  if (!enough && tools.length === 0) {
    return {
      kind: 'jev3',
      suggest: 'NEED_TOOL',
      confidence: 0.65,
      reason: 'not_enough_no_tools',
    };
  }
  if (!enough) {
    return {
      kind: 'jev3',
      suggest: 'NEED_TOOL',
      confidence: 0.55,
      reason: 'not_enough_need_more',
    };
  }
  return {
    kind: 'jev3',
    suggest: 'CONTINUE',
    confidence: 0.8,
    reason: 'enough_info',
  };
}

module.exports = {
  isJevControlEnabled,
  evaluateJev1Context,
  evaluateJev2ModelRoute,
  evaluateJev3Supervisor,
};
