/**
 * G4.4 / G4.6 — LLM semantic / conflict projection with evidence requirement.
 */

function buildSemanticPrompt(batch = []) {
  return [
    'You are Requirement Semantic Projection (G4). Return JSON only.',
    'Do NOT invent effort, schedule, capacity, FTE, or employee assignments.',
    'For each FR return semanticInterpretation, ambiguities, relationships, and evidence.',
    'Schema: { "items":[{ "frId", "semanticInterpretation":{"capability","intent"}, "ambiguities":[{"field","issue"}], "relationships":[{"target","reason"}], "evidence":[{"type","id","field","value"}] }] }',
    'Each item MUST include evidence referencing source_fr and/or signal.',
    'Candidates:',
    JSON.stringify(
      batch.map((c) => ({
        frId: c.frId,
        name: c.name || null,
        description: c.description || null,
        moduleLabel: c.module || null,
        actor: Array.isArray(c.actors) ? c.actors.join(', ') : c.actors || null,
        acceptanceCriteria: c.acceptanceCriteria || null,
        priority: c.priority || null,
        text: c.text,
        signals: {
          actors: c.actors,
          actions: c.actions,
          objects: c.objects,
          fields: c.fields,
          module: c.module,
        },
        flags: c.reasons || c.flags,
      }))
    ),
  ].join('\n');
}

function buildConflictPrompt(batch = []) {
  return [
    'You are Conflict/Gap Projection (G4). Return JSON only.',
    'Explain semantic conflicts or gaps. No effort/schedule.',
    'Schema: { "conflicts":[{ "frIds":[], "issue", "evidence":[{"type","id"}] }] }',
    JSON.stringify(batch),
  ].join('\n');
}

function ensureEvidence(item, frId) {
  const evidence = Array.isArray(item?.evidence) ? [...item.evidence] : [];
  if (!evidence.length) {
    evidence.push({ type: 'source_fr', id: frId });
  }
  return evidence;
}

function normalizeSemanticItems(data, requireEvidence) {
  const items = Array.isArray(data?.items) ? data.items : [];
  const out = [];
  for (const raw of items) {
    const frId = String(raw?.frId || '').trim();
    if (!frId) continue;
    const evidence = ensureEvidence(raw, frId);
    if (requireEvidence && !evidence.length) continue;
    out.push({
      frId,
      semanticInterpretation: raw.semanticInterpretation || {
        capability: null,
        intent: null,
      },
      ambiguities: Array.isArray(raw.ambiguities) ? raw.ambiguities : [],
      relationships: Array.isArray(raw.relationships) ? raw.relationships : [],
      evidence,
    });
  }
  return out;
}

/**
 * @param {{ generateJson: Function, batch: object[], policy: object, requireEvidence: boolean }} opts
 */
async function runSemanticProjection(opts = {}) {
  const generate = opts.generateJson;
  const batch = opts.batch || [];
  const policy = opts.policy || {};
  if (!batch.length || !policy.enabled) {
    return { ok: true, skipped: true, items: [], error: null, llmCalls: 0 };
  }
  const result = await generate({
    prompt: buildSemanticPrompt(batch),
    numPredict: policy.maxOutputTokens || 512,
    numCtx: policy.numCtx || 4096,
    timeoutMs: policy.timeoutMs || 60_000,
    env: opts.env,
  });
  if (result.skipped) {
    return { ok: false, skipped: true, items: [], error: result.error || 'llm_skipped', llmCalls: 0 };
  }
  if (!result.ok) {
    return {
      ok: false,
      skipped: false,
      items: [],
      error: result.error || 'ollama_error',
      llmCalls: 1,
    };
  }
  const items = normalizeSemanticItems(result.data, opts.requireEvidence !== false);
  return { ok: true, skipped: false, items, error: null, llmCalls: 1 };
}

async function runConflictProjection(opts = {}) {
  const generate = opts.generateJson;
  const batch = opts.batch || [];
  const policy = opts.policy || {};
  if (!batch.length || !policy.enabled) {
    return { ok: true, skipped: true, conflicts: [], error: null, llmCalls: 0 };
  }
  const result = await generate({
    prompt: buildConflictPrompt(batch),
    numPredict: policy.maxOutputTokens || 384,
    numCtx: policy.numCtx || 4096,
    timeoutMs: policy.timeoutMs || 45_000,
    env: opts.env,
  });
  if (!result.ok || result.skipped) {
    return {
      ok: false,
      skipped: Boolean(result.skipped),
      conflicts: [],
      error: result.error || 'ollama_error',
      llmCalls: result.skipped ? 0 : 1,
    };
  }
  const conflicts = Array.isArray(result.data?.conflicts) ? result.data.conflicts : [];
  return { ok: true, skipped: false, conflicts, error: null, llmCalls: 1 };
}

module.exports = {
  buildSemanticPrompt,
  buildConflictPrompt,
  normalizeSemanticItems,
  runSemanticProjection,
  runConflictProjection,
};
