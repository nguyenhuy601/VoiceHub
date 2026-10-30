/**
 * Compact RAG citations for WHAT LLM prompts.
 * Required inputs are formatted separately and never truncated by prompt budget.
 */

const DEFAULT_MAX_ITEMS = 6;
const DEFAULT_SNIPPET = 200;
const DEFAULT_MAX_CHARS = 900;

function citationRows(contextPackage) {
  if (!contextPackage || typeof contextPackage !== 'object') return [];
  if (Array.isArray(contextPackage.citations)) return contextPackage.citations;
  if (Array.isArray(contextPackage.docs)) return contextPackage.docs;
  return [];
}

/**
 * @param {object|null|undefined} contextPackage
 * @param {{ maxItems?: number, maxChars?: number, snippetMax?: number, includeRequired?: boolean }} [opts]
 * @returns {{ text: string, items: { sourceId: string|null, snippet: string }[], mode: string|null, requiredText: string }}
 */
function formatRetrievedContext(contextPackage, opts = {}) {
  const maxItems = opts.maxItems || DEFAULT_MAX_ITEMS;
  const maxChars = opts.maxChars || DEFAULT_MAX_CHARS;
  const snippetMax = opts.snippetMax || DEFAULT_SNIPPET;
  const mode = contextPackage?.mode != null ? String(contextPackage.mode) : null;
  const required = Array.isArray(contextPackage?.requiredInputs)
    ? contextPackage.requiredInputs
    : [];

  const requiredLines = required.map((r) => {
    const sourceId = String(r?.sourceId || r?.id || '').trim();
    const snippet = String(r?.text || r?.snippet || '')
      .replace(/\s+/g, ' ')
      .trim();
    return sourceId ? `[required:${sourceId}] ${snippet}` : snippet;
  }).filter(Boolean);
  const requiredText = requiredLines.join('\n');

  const items = [];
  let used = 0;
  const requiredIds = new Set(required.map((r) => String(r.sourceId || '')));

  for (const row of citationRows(contextPackage)) {
    if (row?.required) continue;
    if (items.length >= maxItems) break;
    const sourceId = String(row?.sourceId || row?.id || row?.citationId || '').trim();
    if (sourceId && requiredIds.has(sourceId)) continue;
    const snippet = String(row?.snippet || row?.text || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, snippetMax);
    if (!snippet) continue;
    const line = sourceId ? `[${sourceId}] ${snippet}` : snippet;
    if (used + line.length > maxChars) break;
    items.push({ sourceId: sourceId || null, snippet });
    used += line.length + 1;
  }

  const supplementText = items
    .map((it) => (it.sourceId ? `[${it.sourceId}] ${it.snippet}` : it.snippet))
    .join('\n');

  const text = [requiredText, supplementText].filter(Boolean).join('\n');

  return { text, items, mode, requiredText };
}

/**
 * Query for WHAT retrieve — CR/chunk + task purpose; FR only as optional contrast.
 * @param {{
 *   snapshot?: object,
 *   pack?: object,
 *   functionalRequirements?: object[],
 *   taskPurpose?: string,
 *   requiredInputs?: object[],
 *   customerRawChunk?: object,
 * }} args
 */
function buildWhatRetrieveQuery(args = {}) {
  const bits = [];
  const purpose = String(args.taskPurpose || '').trim();
  if (purpose) bits.push(`task: ${purpose}`);

  const chunk =
    args.customerRawChunk ||
    (Array.isArray(args.requiredInputs) && args.requiredInputs[0]) ||
    null;
  if (chunk && typeof chunk === 'object') {
    bits.push(
      String(chunk.text || chunk.snippet || chunk.description || '').trim()
    );
    bits.push(String(chunk.sourceId || chunk.id || '').trim());
  }

  // Fallback when no CR bound yet: light overview (not FR-first)
  if (bits.filter(Boolean).length <= (purpose ? 1 : 0)) {
    const snapshot = args.snapshot;
    const ov =
      (snapshot?.overview && typeof snapshot.overview === 'object' && snapshot.overview) ||
      (snapshot?.projected?.overview &&
        typeof snapshot.projected.overview === 'object' &&
        snapshot.projected.overview) ||
      {};
    bits.push(
      ov.requirementName || ov.projectName || ov.name,
      ov.projectObjective || ov.problemStatement || ov.summary || ov.description
    );
  }

  // FR titles only as contrast (max 3), never primary for CR→FR
  const frs = Array.isArray(args.functionalRequirements)
    ? args.functionalRequirements
    : [];
  if (frs.length && purpose && !/^cr/i.test(purpose)) {
    for (const fr of frs.slice(0, 3)) {
      bits.push(fr?.name || fr?.title || fr?.description);
    }
  }

  const query = bits
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join('\n')
    .slice(0, 1500);
  return query || purpose || 'requirements';
}

module.exports = {
  formatRetrievedContext,
  buildWhatRetrieveQuery,
  DEFAULT_MAX_ITEMS,
  DEFAULT_MAX_CHARS,
};
