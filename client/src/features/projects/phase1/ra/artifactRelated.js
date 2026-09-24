/**
 * Resolve related artifacts for Wave 4 detail pane.
 * Sources: ArtifactTraceLink (either direction) + structured soft keys (relatedUcKeys / relatedFrKeys / relatedBgKey).
 * DEC-2: show draft+approved peers — no status filter here.
 */

/**
 * @typedef {{
 *   id: string,
 *   externalKey: string,
 *   title: string,
 *   kind: string,
 *   status?: string,
 *   linkType: string|null,
 *   source: 'trace'|'key',
 *   unresolved?: boolean,
 * }} RelatedArtifactItem
 */

function artifactId(row) {
  return String(row?.id || row?._id || '').trim();
}

function asKeyList(value) {
  if (Array.isArray(value)) return value.map((v) => String(v || '').trim()).filter(Boolean);
  if (value == null || value === '') return [];
  return [String(value).trim()].filter(Boolean);
}

/**
 * Soft-key refs on structured (imported workbook / form tags).
 * @param {object} structured
 * @returns {{ key: string, expectKind: string }[]}
 */
export function listStructuredRelationKeys(structured) {
  const st = structured && typeof structured === 'object' ? structured : {};
  const out = [];
  for (const key of asKeyList(st.relatedUcKeys)) out.push({ key, expectKind: 'UC' });
  for (const key of asKeyList(st.relatedFrKeys)) out.push({ key, expectKind: 'FR' });
  for (const key of asKeyList(st.relatedBgKey)) out.push({ key, expectKind: 'BG' });
  for (const key of asKeyList(st.brIds)) out.push({ key, expectKind: 'BR' });
  for (const key of asKeyList(st.bpmIds)) out.push({ key, expectKind: 'BPM' });
  return out;
}

/**
 * @param {{ artifact: object, links?: object[], catalog?: object[] }} args
 * @returns {RelatedArtifactItem[]}
 */
export function resolveArtifactRelated({ artifact, links = [], catalog = [] }) {
  const selfId = artifactId(artifact);
  if (!selfId) return [];

  const byId = new Map();
  const byKey = new Map();
  for (const row of catalog) {
    const id = artifactId(row);
    if (!id) continue;
    byId.set(id, row);
    const ek = String(row.externalKey || '').trim();
    if (ek) byKey.set(ek, row);
  }

  /** @type {Map<string, RelatedArtifactItem>} */
  const seen = new Map();

  const push = (item) => {
    if (!item?.id || item.id === selfId) return;
    const prev = seen.get(item.id);
    // Prefer formal trace over soft key for same peer
    if (!prev || (prev.source === 'key' && item.source === 'trace')) {
      seen.set(item.id, item);
    }
  };

  for (const link of links) {
    const from = String(link?.fromArtifactId || '').trim();
    const to = String(link?.toArtifactId || '').trim();
    let otherId = '';
    if (from === selfId) otherId = to;
    else if (to === selfId) otherId = from;
    else continue;
    if (!otherId) continue;

    const other = byId.get(otherId);
    if (other) {
      push({
        id: artifactId(other),
        externalKey: String(other.externalKey || ''),
        title: String(other.title || ''),
        kind: String(other.kind || '').toUpperCase(),
        status: String(other.status || ''),
        linkType: link.linkType ? String(link.linkType) : null,
        source: 'trace',
      });
    } else {
      push({
        id: otherId,
        externalKey: '',
        title: '',
        kind: '',
        linkType: link.linkType ? String(link.linkType) : null,
        source: 'trace',
        unresolved: true,
      });
    }
  }

  for (const { key, expectKind } of listStructuredRelationKeys(artifact?.structured)) {
    const other = byKey.get(key);
    if (other) {
      push({
        id: artifactId(other),
        externalKey: String(other.externalKey || key),
        title: String(other.title || ''),
        kind: String(other.kind || expectKind).toUpperCase(),
        status: String(other.status || ''),
        linkType: null,
        source: 'key',
      });
    } else {
      push({
        id: `key:${expectKind}:${key}`,
        externalKey: key,
        title: '',
        kind: expectKind,
        linkType: null,
        source: 'key',
        unresolved: true,
      });
    }
  }

  return Array.from(seen.values()).sort((a, b) => {
    const ka = `${a.kind}:${a.externalKey}:${a.id}`;
    const kb = `${b.kind}:${b.externalKey}:${b.id}`;
    return ka.localeCompare(kb);
  });
}

/** Reverse of ARTIFACT_KIND_BY_MODULE — keep local to avoid circular imports in tests. */
export const ANALYSIS_MODULE_BY_KIND = Object.freeze({
  BG: 'analysis-bg',
  BR: 'analysis-br',
  BPM: 'analysis-bpm',
  FR: 'analysis-fr',
  UC: 'analysis-uc',
  NFR: 'analysis-nfr',
  SCOPE: 'analysis-scope',
  INTERFACE: 'analysis-interface',
  DATA: 'analysis-data',
  GLOSSARY: 'analysis-glossary',
  ASSUMPTION: 'analysis-assumption',
});

export function modulePathForArtifactKind(kind) {
  return ANALYSIS_MODULE_BY_KIND[String(kind || '').trim().toUpperCase()] || null;
}
