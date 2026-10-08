/**
 * Pure traceability gap lists for Analysis artifacts (Wave B).
 * Soft keys + ArtifactTraceLink both count as covered (RULE-03).
 */

function asKeyList(value) {
  if (Array.isArray(value)) return value.map((v) => String(v || '').trim()).filter(Boolean);
  if (value == null || value === '') return [];
  return String(value)
    .split(/[,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function gapItem(a) {
  return {
    id: String(a._id || a.id || ''),
    externalKey: a.externalKey,
    title: a.title,
  };
}

/**
 * @param {{ artifacts: object[], links?: object[] }} input
 */
function summarizeTraceGaps({ artifacts = [], links = [] }) {
  const byKind = (k) => artifacts.filter((a) => a.kind === k);
  const frReqs = byKind('FR').filter(
    (a) => String(a.structured?.level || '').toLowerCase() === 'requirement'
  );
  const ucs = byKind('UC');
  const brs = byKind('BR');
  const bgs = byKind('BG');
  const bpms = byKind('BPM');

  const ucCovers = new Set();
  for (const link of links) {
    if (link.linkType !== 'implements') continue;
    const from = artifacts.find((a) => String(a._id) === String(link.fromArtifactId));
    const to = artifacts.find((a) => String(a._id) === String(link.toArtifactId));
    if (from?.kind === 'UC' && to?.kind === 'FR') ucCovers.add(String(to._id));
  }
  for (const uc of ucs) {
    const keys = Array.isArray(uc.structured?.relatedFrKeys) ? uc.structured.relatedFrKeys : [];
    for (const key of keys) {
      const fr = frReqs.find((f) => f.externalKey === key);
      if (fr) ucCovers.add(String(fr._id));
    }
  }
  const frMissingUc = frReqs.filter((f) => !ucCovers.has(String(f._id))).map(gapItem);

  const brCovered = new Set();
  for (const link of links) {
    if (link.linkType !== 'derives') continue;
    const from = artifacts.find((a) => String(a._id) === String(link.fromArtifactId));
    const to = artifacts.find((a) => String(a._id) === String(link.toArtifactId));
    if (from?.kind === 'BR' && to?.kind === 'BG') brCovered.add(String(from._id));
  }
  for (const br of brs) {
    const bgKey = String(br.structured?.relatedBgKey || '').trim();
    if (bgKey && bgs.some((bg) => bg.externalKey === bgKey)) {
      brCovered.add(String(br._id));
    }
  }
  const brMissingBg = brs.filter((br) => !brCovered.has(String(br._id))).map(gapItem);

  const frMissingCr = frReqs
    .filter((f) => asKeyList(f.structured?.customerRequirementIds).length === 0)
    .map(gapItem);

  const bpmCovered = new Set();
  for (const link of links) {
    if (link.linkType !== 'derives' && link.linkType !== 'implements') continue;
    const from = artifacts.find((a) => String(a._id) === String(link.fromArtifactId));
    const to = artifacts.find((a) => String(a._id) === String(link.toArtifactId));
    if (from?.kind === 'BPM' && to?.kind === 'BR') bpmCovered.add(String(from._id));
  }
  for (const bpm of bpms) {
    const brKey = String(
      bpm.structured?.relatedBrKey || bpm.structured?.relatedBr || ''
    ).trim();
    if (brKey && brs.some((br) => br.externalKey === brKey)) {
      bpmCovered.add(String(bpm._id));
    }
  }
  const bpmMissingBr = bpms.filter((b) => !bpmCovered.has(String(b._id))).map(gapItem);

  return { frMissingUc, brMissingBg, frMissingCr, bpmMissingBr };
}

module.exports = {
  summarizeTraceGaps,
  asKeyList,
};
