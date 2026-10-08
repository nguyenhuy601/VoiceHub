/**
 * Pure helpers for Phase 1 Traceability hub (Waves A–C).
 * No React / API side effects.
 */

export function artifactRowId(row) {
  return String(row?.id || row?._id || '').trim();
}

export function asKeyList(value) {
  if (Array.isArray(value)) return value.map((v) => String(v || '').trim()).filter(Boolean);
  if (value == null || value === '') return [];
  return String(value)
    .split(/[,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function structuredOf(row) {
  return row?.structured && typeof row.structured === 'object' ? row.structured : {};
}

/** Phases where UC → TC deep-link is enabled. */
export const TC_DEEP_LINK_PHASES = Object.freeze([
  'development',
  'qa_uat',
  'release_handover',
]);

export function isTcDeepLinkPhase(deliveryPhase) {
  return TC_DEEP_LINK_PHASES.includes(String(deliveryPhase || '').trim().toLowerCase());
}

/**
 * CR ↔ Analysis matrix from soft keys on artifacts.
 * @param {object[]} artifacts
 * @returns {{ crId: string, peers: { id: string, kind: string, externalKey: string, title: string }[] }[]}
 */
export function buildCrAnalysisRows(artifacts) {
  const byCr = new Map();
  for (const row of artifacts || []) {
    const st = structuredOf(row);
    const crs = asKeyList(st.customerRequirementIds);
    if (!crs.length) continue;
    const id = artifactRowId(row);
    const peer = {
      id,
      kind: String(row.kind || '').toUpperCase(),
      externalKey: String(row.externalKey || ''),
      title: String(row.title || ''),
    };
    for (const crId of crs) {
      if (!byCr.has(crId)) byCr.set(crId, []);
      byCr.get(crId).push(peer);
    }
  }
  return [...byCr.entries()]
    .map(([crId, peers]) => ({ crId, peers }))
    .sort((a, b) => a.crId.localeCompare(b.crId));
}

/**
 * BR → BG pairs from formal `derives` links and soft relatedBgKey.
 * @returns {{ br: object, bg: object|null, linkType: string|null, source: 'trace'|'key' }[]}
 */
export function buildBrToBgPairs({ brs = [], bgs = [], links = [] }) {
  const bgById = new Map(bgs.map((b) => [artifactRowId(b), b]));
  const bgByKey = new Map(bgs.map((b) => [String(b.externalKey || '').trim(), b]));
  const pairs = [];
  const seen = new Set();

  for (const link of links) {
    if (String(link.linkType || '') !== 'derives') continue;
    const fromId = String(link.fromArtifactId || '').trim();
    const toId = String(link.toArtifactId || '').trim();
    const br = brs.find((b) => artifactRowId(b) === fromId);
    const bg = bgById.get(toId);
    if (!br || !bg) continue;
    const key = `${artifactRowId(br)}::${artifactRowId(bg)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push({ br, bg, linkType: 'derives', source: 'trace' });
  }

  for (const br of brs) {
    const bgKey = String(structuredOf(br).relatedBgKey || '').trim();
    if (!bgKey) continue;
    const bg = bgByKey.get(bgKey);
    const key = `${artifactRowId(br)}::${bg ? artifactRowId(bg) : bgKey}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push({
      br,
      bg: bg || null,
      linkType: null,
      source: 'key',
      unresolvedBgKey: bg ? null : bgKey,
    });
  }

  return pairs.sort((a, b) =>
    String(a.br.externalKey || '').localeCompare(String(b.br.externalKey || ''))
  );
}

/**
 * BPM → BR pairs from soft relatedBrKey / relatedBr and formal derives/implements.
 */
export function buildBpmToBrPairs({ bpms = [], brs = [], links = [] }) {
  const brById = new Map(brs.map((b) => [artifactRowId(b), b]));
  const brByKey = new Map(brs.map((b) => [String(b.externalKey || '').trim(), b]));
  const pairs = [];
  const seen = new Set();

  for (const link of links) {
    const lt = String(link.linkType || '');
    if (lt !== 'derives' && lt !== 'implements') continue;
    const fromId = String(link.fromArtifactId || '').trim();
    const toId = String(link.toArtifactId || '').trim();
    const bpm = bpms.find((b) => artifactRowId(b) === fromId);
    const br = brById.get(toId);
    if (!bpm || !br || String(br.kind || 'BR').toUpperCase() !== 'BR') continue;
    if (String(bpm.kind || 'BPM').toUpperCase() !== 'BPM') continue;
    const key = `${artifactRowId(bpm)}::${artifactRowId(br)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push({ bpm, br, linkType: lt, source: 'trace' });
  }

  for (const bpm of bpms) {
    const st = structuredOf(bpm);
    const brKey = String(st.relatedBrKey || st.relatedBr || '').trim();
    if (!brKey) continue;
    const br = brByKey.get(brKey);
    const key = `${artifactRowId(bpm)}::${br ? artifactRowId(br) : brKey}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push({
      bpm,
      br: br || null,
      linkType: null,
      source: 'key',
      unresolvedBrKey: br ? null : brKey,
    });
  }

  return pairs.sort((a, b) =>
    String(a.bpm.externalKey || '').localeCompare(String(b.bpm.externalKey || ''))
  );
}

/**
 * NFR → FR via constrains links or soft relatedFrKeys.
 */
export function buildNfrToFrPairs({ nfrs = [], frs = [], links = [] }) {
  const frById = new Map(frs.map((f) => [artifactRowId(f), f]));
  const frByKey = new Map(frs.map((f) => [String(f.externalKey || '').trim(), f]));
  const pairs = [];
  const seen = new Set();

  for (const link of links) {
    if (String(link.linkType || '') !== 'constrains') continue;
    const fromId = String(link.fromArtifactId || '').trim();
    const toId = String(link.toArtifactId || '').trim();
    const nfr = nfrs.find((n) => artifactRowId(n) === fromId);
    const fr = frById.get(toId);
    if (!nfr || !fr) continue;
    const key = `${artifactRowId(nfr)}::${artifactRowId(fr)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push({ nfr, fr, linkType: 'constrains', source: 'trace' });
  }

  for (const nfr of nfrs) {
    for (const frKey of asKeyList(structuredOf(nfr).relatedFrKeys)) {
      const fr = frByKey.get(frKey);
      const key = `${artifactRowId(nfr)}::${fr ? artifactRowId(fr) : frKey}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push({
        nfr,
        fr: fr || null,
        linkType: null,
        source: 'key',
        unresolvedFrKey: fr ? null : frKey,
      });
    }
  }

  return pairs.sort((a, b) =>
    String(a.nfr.externalKey || '').localeCompare(String(b.nfr.externalKey || ''))
  );
}

/**
 * SCOPE rows with CR soft keys (scopes relationship display).
 */
export function buildScopeCrRows(scopes = []) {
  return (scopes || [])
    .map((scope) => ({
      scope,
      crIds: asKeyList(structuredOf(scope).customerRequirementIds),
      scopeType: String(structuredOf(scope).scopeType || ''),
    }))
    .sort((a, b) =>
      String(a.scope.externalKey || '').localeCompare(String(b.scope.externalKey || ''))
    );
}

/** NFRs with no FR link (warning-only gap for Wave C). */
export function listNfrMissingFr({ nfrs = [], frs = [], links = [] }) {
  const paired = new Set(
    buildNfrToFrPairs({ nfrs, frs, links })
      .filter((p) => p.fr)
      .map((p) => artifactRowId(p.nfr))
  );
  return (nfrs || []).filter((n) => !paired.has(artifactRowId(n)));
}

/**
 * Implements-link peers for an FR (UC or other).
 */
export function listImplementsPeersForArtifact(artifactId, links = [], catalogById) {
  const id = String(artifactId || '').trim();
  if (!id) return [];
  const out = [];
  for (const link of links) {
    if (String(link.linkType || '') !== 'implements') continue;
    const from = String(link.fromArtifactId || '');
    const to = String(link.toArtifactId || '');
    if (from !== id && to !== id) continue;
    const peerId = from === id ? to : from;
    const peer = catalogById?.get?.(peerId);
    out.push({ link, peerId, peer });
  }
  return out;
}
