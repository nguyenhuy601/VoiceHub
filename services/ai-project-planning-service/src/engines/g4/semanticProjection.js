/**
 * G4.4 / G4.6 — LLM semantic / conflict projection with evidence requirement.
 */

function buildSemanticPrompt(batch = [], contextText = '') {
  const lines = [
    'You are Requirement Semantic Projection (G4). Return JSON only.',
    'Do NOT invent effort, schedule, capacity, FTE, or employee assignments.',
    'For EACH input FR emit exactly one object inside items[] — do not flatten ambiguities to top-level items.',
    'Each item MUST have frId matching an input FR id.',
    'Schema: { "items":[{ "frId", "semanticInterpretation":{"capability","intent"}, "ambiguities":[{"field","issue"}], "relationships":[{"target","reason"}], "evidence":[{"type","id","field","value"}] }] }',
    'Example: { "items":[{ "frId":"CR-1", "semanticInterpretation":{"capability":"…","intent":"…"}, "ambiguities":[{"field":"kpi","issue":"undefined"}], "relationships":[], "evidence":[{"type":"source_fr","id":"CR-1"}] }] }',
    'Each item MUST include evidence referencing source_fr and/or signal.',
  ];
  const retrieved = String(contextText || '').trim();
  if (retrieved) {
    lines.push(
      'Retrieved snapshot context (G7). Use only as supporting evidence. Do not invent ids that are not in Candidates or this context.',
      retrieved
    );
  }
  lines.push(
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
  );
  return lines.join('\n');
}

function buildConflictPrompt(batch = [], contextText = '') {
  const lines = [
    'You are Conflict Verification (G4). Return JSON only.',
    'Verify each potential conflict pair using the FR pair, normalized facts, and retrieved snapshot context when provided.',
    'No effort/schedule.',
    'Schema: { "verdicts":[{ "pairKey", "verdict":"CONFIRMED"|"REJECTED"|"UNCLEAR", "reason", "evidence":[{"type","id"}] }] }',
    'Also accept legacy: { "conflicts":[{ "frIds":[], "issue", "evidence":[] }] } mapped as CONFIRMED.',
  ];
  const retrieved = String(contextText || '').trim();
  if (retrieved) {
    lines.push('Retrieved snapshot context (G7):', retrieved);
  }
  lines.push(JSON.stringify(batch));
  return lines.join('\n');
}

function ensureEvidence(item, frId) {
  const evidence = Array.isArray(item?.evidence) ? [...item.evidence] : [];
  if (!evidence.length) {
    evidence.push({ type: 'source_fr', id: frId });
  }
  return evidence;
}

function coerceSemanticItemsShape(data, batch = []) {
  const items = Array.isArray(data?.items) ? data.items : [];
  if (!items.length) return [];
  // Happy path: objects already have frId
  if (items.some((x) => String(x?.frId || '').trim())) {
    return items.filter((x) => String(x?.frId || '').trim());
  }
  // Model sometimes flattens fields into items[] without frId — rebuild one item per batch FR
  const fallbackId = String(batch[0]?.frId || '').trim();
  if (!fallbackId) return [];
  const ambiguities = [];
  const relationships = [];
  let capability = null;
  let intent = null;
  const evidence = [];
  for (const raw of items) {
    if (!raw || typeof raw !== 'object') continue;
    if (raw.capability || raw.intent || raw.semanticInterpretation) {
      capability = raw.capability || raw.semanticInterpretation?.capability || capability;
      intent = raw.intent || raw.semanticInterpretation?.intent || intent;
    }
    if (raw.field || raw.issue) {
      ambiguities.push({ field: raw.field || null, issue: raw.issue || null });
    }
    if (raw.target || raw.reason) {
      relationships.push({ target: raw.target || null, reason: raw.reason || null });
    }
    if (raw.type === 'source_fr' || raw.id) {
      evidence.push({
        type: raw.type || 'source_fr',
        id: raw.id || fallbackId,
        field: raw.field || null,
        value: raw.value || null,
      });
    }
  }
  return [
    {
      frId: fallbackId,
      semanticInterpretation: { capability, intent },
      ambiguities,
      relationships,
      evidence: evidence.length ? evidence : [{ type: 'source_fr', id: fallbackId }],
    },
  ];
}

function normalizeSemanticItems(data, requireEvidence, batch = []) {
  const items = coerceSemanticItemsShape(data, batch);
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
    return { ok: true, skipped: true, items: [], error: null, llmCalls: 0, evalCount: 0, durationMs: 0, promptChars: 0 };
  }
  const prompt = buildSemanticPrompt(batch, opts.contextText || '');
  const t0 = Date.now();
  const result = await generate({
    prompt,
    numPredict: policy.maxOutputTokens || 512,
    numCtx: policy.numCtx || 4096,
    timeoutMs: policy.timeoutMs || 60_000,
    env: opts.env,
  });
  const durationMs = Math.max(0, Date.now() - t0);
  const evalCount = Number(result.usage?.evalCount) || 0;
  const promptChars = prompt.length;
  if (result.skipped) {
    return {
      ok: false,
      skipped: true,
      items: [],
      error: result.error || 'llm_skipped',
      llmCalls: 0,
      evalCount,
      durationMs,
      promptChars,
    };
  }
  if (!result.ok) {
    return {
      ok: false,
      skipped: false,
      items: [],
      error: result.error || 'ollama_error',
      llmCalls: 1,
      evalCount,
      durationMs,
      promptChars,
    };
  }
  const items = normalizeSemanticItems(result.data, opts.requireEvidence !== false, batch);
  return {
    ok: true,
    skipped: false,
    items,
    error: null,
    llmCalls: 1,
    evalCount,
    durationMs,
    promptChars,
  };
}

async function runConflictProjection(opts = {}) {
  const generate = opts.generateJson;
  const batch = opts.batch || [];
  const policy = opts.policy || {};
  if (!batch.length || !policy.enabled) {
    return {
      ok: true,
      skipped: true,
      conflicts: [],
      verdicts: [],
      error: null,
      llmCalls: 0,
      evalCount: 0,
      durationMs: 0,
      promptChars: 0,
      skipReason: 'no_batch_or_disabled',
    };
  }
  const prompt = buildConflictPrompt(batch, opts.contextText || '');
  const t0 = Date.now();
  const result = await generate({
    prompt,
    numPredict: policy.maxOutputTokens || 384,
    numCtx: policy.numCtx || 4096,
    timeoutMs: policy.timeoutMs || 45_000,
    env: opts.env,
  });
  const durationMs = Math.max(0, Date.now() - t0);
  const evalCount = Number(result.usage?.evalCount) || 0;
  const promptChars = prompt.length;
  if (!result.ok || result.skipped) {
    return {
      ok: false,
      skipped: Boolean(result.skipped),
      conflicts: [],
      verdicts: [],
      evalCount,
      durationMs,
      promptChars,
      error: result.error || 'ollama_error',
      llmCalls: result.skipped ? 0 : 1,
    };
  }
  const verdictsRaw = Array.isArray(result.data?.verdicts) ? result.data.verdicts : [];
  const legacy = Array.isArray(result.data?.conflicts) ? result.data.conflicts : [];
  const verdicts = [];
  for (const v of verdictsRaw) {
    const verdict = String(v?.verdict || '').toUpperCase();
    if (!['CONFIRMED', 'REJECTED', 'UNCLEAR'].includes(verdict)) continue;
    verdicts.push({
      pairKey: v.pairKey || null,
      frIds: Array.isArray(v.frIds) ? v.frIds : [],
      verdict,
      reason: v.reason || null,
      evidence: Array.isArray(v.evidence) ? v.evidence : [],
    });
  }
  for (const c of legacy) {
    verdicts.push({
      pairKey: null,
      frIds: Array.isArray(c.frIds) ? c.frIds : [],
      verdict: 'CONFIRMED',
      reason: c.issue || null,
      evidence: Array.isArray(c.evidence) ? c.evidence : [],
    });
  }
  const conflicts = verdicts
    .filter((v) => v.verdict === 'CONFIRMED')
    .map((v) => ({
      frIds: v.frIds,
      issue: v.reason,
      evidence: v.evidence,
      pairKey: v.pairKey,
      verdict: v.verdict,
    }));
  return {
    ok: true,
    skipped: false,
    conflicts,
    verdicts,
    error: null,
    llmCalls: 1,
    evalCount,
    durationMs,
    promptChars,
  };
}

module.exports = {
  buildSemanticPrompt,
  buildConflictPrompt,
  normalizeSemanticItems,
  runSemanticProjection,
  runConflictProjection,
};
