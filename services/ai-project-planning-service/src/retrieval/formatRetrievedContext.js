/**
 * Compact G7 citations for WHAT LLM prompts.
 * One switch (G7_RAG_MODE) retrieves once; every WHAT LLM section reads this block.
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
 * @param {{ maxItems?: number, maxChars?: number, snippetMax?: number }} [opts]
 * @returns {{ text: string, items: { sourceId: string|null, snippet: string }[], mode: string|null }}
 */
function formatRetrievedContext(contextPackage, opts = {}) {
  const maxItems = opts.maxItems || DEFAULT_MAX_ITEMS;
  const maxChars = opts.maxChars || DEFAULT_MAX_CHARS;
  const snippetMax = opts.snippetMax || DEFAULT_SNIPPET;
  const mode = contextPackage?.mode != null ? String(contextPackage.mode) : null;
  const items = [];
  let used = 0;

  for (const row of citationRows(contextPackage)) {
    if (items.length >= maxItems) break;
    const sourceId = String(row?.sourceId || row?.id || row?.citationId || '').trim();
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

  const text = items
    .map((it) => (it.sourceId ? `[${it.sourceId}] ${it.snippet}` : it.snippet))
    .join('\n');

  return { text, items, mode };
}

/**
 * Query for WHAT retrieve — overview + a few FR titles, not the literal token "what_requirements".
 * @param {{ snapshot?: object, functionalRequirements?: object[] }} args
 */
function buildWhatRetrieveQuery({ snapshot, functionalRequirements } = {}) {
  const ov =
    (snapshot?.overview && typeof snapshot.overview === 'object' && snapshot.overview) ||
    (snapshot?.projected?.overview &&
      typeof snapshot.projected.overview === 'object' &&
      snapshot.projected.overview) ||
    {};
  const bits = [
    ov.requirementName || ov.projectName || ov.name,
    ov.projectObjective || ov.problemStatement || ov.summary || ov.description,
    ov.businessScope || ov.scope,
  ];
  const frs = Array.isArray(functionalRequirements) ? functionalRequirements : [];
  for (const fr of frs.slice(0, 6)) {
    bits.push(fr?.name || fr?.title || fr?.description);
  }
  const query = bits
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join('\n')
    .slice(0, 1500);
  return query || 'requirements';
}

module.exports = {
  formatRetrievedContext,
  buildWhatRetrieveQuery,
  DEFAULT_MAX_ITEMS,
  DEFAULT_MAX_CHARS,
};
