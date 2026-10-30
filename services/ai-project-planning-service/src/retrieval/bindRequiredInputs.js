/**
 * Bind task-required sources (CR/FR/AC) before RAG supplement.
 * Required must appear in prompt regardless of retrieve topK.
 */

const { matchesScope, resolveScopeFromSnapshot } = require('./scopeFilter');
const { filterDocsForGenerate, withProvenanceDefaults, ORIGIN, APPROVAL } =
  require('./provenanceFilters');

const DEFAULT_REQUIRED_MAX_CHARS = 12000;

function clip(text, max) {
  const t = String(text || '').trim();
  if (!max || t.length <= max) return t;
  return t.slice(0, max);
}

function rowText(row) {
  if (!row || typeof row !== 'object') return String(row || '').trim();
  return [
    row.id || row.externalId || row.sourceId,
    row.name || row.title,
    row.description || row.text || row.snippet || row.requirement || row.content,
  ]
    .map((p) => String(p || '').trim())
    .filter(Boolean)
    .join('\n');
}

function asCrRows(pack, snapshot) {
  const rows = [];
  const raw =
    pack?.aiAnalysis?.customerRawRows ||
    pack?.customerRawRows ||
    snapshot?.projected?.customerRawRows ||
    snapshot?.customerRawRows ||
    {};
  for (const key of [
    'requirements',
    'functionalRequirements',
    'businessRequests',
    'items',
  ]) {
    const list = Array.isArray(raw[key]) ? raw[key] : [];
    for (const row of list) {
      if (row && typeof row === 'object') rows.push(row);
    }
  }
  const intake = Array.isArray(pack?.aiAnalysis?.analyses?.customerRawRecord?.items)
    ? pack.aiAnalysis.analyses.customerRawRecord.items
    : [];
  for (const row of intake) {
    if (row && typeof row === 'object') rows.push(row);
  }
  return rows;
}

/**
 * @param {{
 *   sourceIds?: string[],
 *   rows?: object[],
 *   pack?: object,
 *   snapshot?: object,
 *   scope?: object,
 *   taskPurpose?: string,
 *   maxChars?: number,
 * }} args
 * @returns {{
 *   requiredInputs: object[],
 *   status: 'ok'|'input_too_large'|'missing',
 *   reason?: string,
 *   splitSuggested?: object[],
 * }}
 */
function bindRequiredInputs(args = {}) {
  const scope =
    args.scope ||
    resolveScopeFromSnapshot(args.snapshot, {
      snapshotId: args.snapshotId,
      projectId: args.projectId,
      tenantId: args.tenantId,
    });
  const maxChars =
    Number(args.maxChars) > 0 ? Number(args.maxChars) : DEFAULT_REQUIRED_MAX_CHARS;

  const wantIds = new Set(
    (Array.isArray(args.sourceIds) ? args.sourceIds : [])
      .map((id) => String(id || '').trim())
      .filter(Boolean)
  );

  let candidates = Array.isArray(args.rows) ? [...args.rows] : [];
  if (!candidates.length) {
    candidates = asCrRows(args.pack, args.snapshot);
  }

  /** Prefer explicit ids; else use provided rows as the unit being analyzed. */
  let selected = [];
  if (wantIds.size) {
    for (const row of candidates) {
      const id = String(
        row?.externalId || row?.id || row?.sourceId || row?.key || ''
      ).trim();
      if (id && wantIds.has(id)) selected.push(row);
    }
  } else {
    selected = candidates;
  }

  const scoped = selected.filter((row) => {
    const meta = withProvenanceDefaults(
      {
        ...(row.metadata || {}),
        snapshotId: scope.snapshotId,
        projectId: scope.projectId,
        tenantId: scope.tenantId,
        sourceId: String(row.externalId || row.id || row.sourceId || '').trim(),
      },
      {
        origin: ORIGIN.CUSTOMER_IMPORT,
        approvalStatus: APPROVAL.DRAFT,
        snapshotId: scope.snapshotId,
        projectId: scope.projectId,
        tenantId: scope.tenantId,
      }
    );
    return matchesScope({ metadata: meta }, scope);
  });

  const forGenerate = filterDocsForGenerate(
    scoped.map((row) => {
      const sourceId = String(
        row.externalId || row.id || row.sourceId || row.key || ''
      ).trim();
      const text = rowText(row);
      return {
        sourceId,
        id: sourceId,
        docType: row.docType || 'customer_raw',
        text,
        snippet: text.slice(0, 400),
        metadata: withProvenanceDefaults(
          {
            ...(row.metadata || {}),
            snapshotId: scope.snapshotId,
            projectId: scope.projectId,
            tenantId: scope.tenantId,
            sourceId,
            spanId: row.spanId || sourceId,
          },
          {
            origin: ORIGIN.CUSTOMER_IMPORT,
            approvalStatus: APPROVAL.DRAFT,
          }
        ),
      };
    })
  );

  if (wantIds.size && !forGenerate.length) {
    return {
      requiredInputs: [],
      status: 'missing',
      reason: 'required_source_not_found_in_scope',
    };
  }

  const totalChars = forGenerate.reduce(
    (n, d) => n + String(d.text || '').length,
    0
  );
  if (totalChars > maxChars) {
    const splitSuggested = forGenerate.map((d) => ({
      sourceId: d.sourceId,
      spanId: d.metadata?.spanId || d.sourceId,
      chars: String(d.text || '').length,
    }));
    return {
      requiredInputs: forGenerate,
      status: 'input_too_large',
      reason: `required_chars=${totalChars}>max=${maxChars}`,
      splitSuggested,
    };
  }

  return {
    requiredInputs: forGenerate.map((d) => ({
      ...d,
      text: clip(d.text, maxChars),
    })),
    status: 'ok',
  };
}

/**
 * Merge required + citations for prompt; never drop required for topK.
 * Supplement may be truncated by prompt budget.
 * @param {{ requiredInputs?: object[], citations?: object[], maxSupplementItems?: number, maxSupplementChars?: number }} args
 */
function assembleRequiredWithCitations(args = {}) {
  const required = Array.isArray(args.requiredInputs) ? args.requiredInputs : [];
  const citations = Array.isArray(args.citations) ? args.citations : [];
  const maxItems =
    Number(args.maxSupplementItems) > 0 ? Number(args.maxSupplementItems) : 6;
  const maxChars =
    Number(args.maxSupplementChars) > 0 ? Number(args.maxSupplementChars) : 900;

  const requiredIds = new Set(required.map((r) => String(r.sourceId || '')));
  const supplement = [];
  let used = 0;
  for (const c of citations) {
    if (supplement.length >= maxItems) break;
    const sourceId = String(c.sourceId || c.citationId || '').trim();
    if (sourceId && requiredIds.has(sourceId)) continue;
    const snippet = String(c.snippet || c.text || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 200);
    if (!snippet) continue;
    const lineLen = (sourceId ? sourceId.length + 3 : 0) + snippet.length;
    if (used + lineLen > maxChars) break;
    supplement.push({
      citationId: String(c.citationId || `cit:${sourceId}`),
      sourceId,
      snippet,
      score: Number(c.score) || 0,
    });
    used += lineLen + 1;
  }

  return {
    requiredInputs: required,
    citations: [
      ...required.map((r, i) => ({
        citationId: `req:${r.sourceId || i}`,
        sourceId: String(r.sourceId || ''),
        snippet: String(r.snippet || r.text || '').slice(0, 400),
        score: 1,
        required: true,
      })),
      ...supplement,
    ],
    supplement,
  };
}

module.exports = {
  bindRequiredInputs,
  assembleRequiredWithCitations,
  asCrRows,
  DEFAULT_REQUIRED_MAX_CHARS,
};
