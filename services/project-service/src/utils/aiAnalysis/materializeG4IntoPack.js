/**
 * Seed pack functionalRequirements from srsProposal (preferred) or legacy G4.
 * Pure — no Mongo. Materialize draft path is separate (approvedSrsVersionManifest.js).
 */

function proposalFrToList(proposal) {
  const items = proposal?.generated?.functionalRequirements?.items;
  if (!Array.isArray(items)) return [];
  return items
    .filter((r) => r && String(r.status || '').toUpperCase() !== 'REJECTED')
    .map((r, i) => {
      const name = String(r.title || r.name || `Requirement ${i + 1}`).trim();
      const rawAc = r.ac || r.acceptanceCriteria;
      const ac = Array.isArray(rawAc)
        ? rawAc.map((row) => String(row || '').trim()).filter(Boolean).join('\n')
        : String(rawAc || '').trim();
      return {
        externalId: String(r.id || r.logicalId || r.externalId || `FR-${i + 1}`).trim(),
        name: name || `Requirement ${i + 1}`,
        description: String(r.description || '').trim(),
        // projectFrNode / RequirementPack schema đọc acceptanceCriteria (không phải ac)
        acceptanceCriteria: ac,
        priority: r.priority || 'Medium',
        moduleLabel: String(r.module || r.moduleLabel || '').trim(),
        featureLabel: String(r.feature || r.featureLabel || '').trim(),
        level: 'Requirement',
        parentExternalId: r.parentId || r.parentExternalId || null,
        source: 'srs_proposal',
        status: 'Draft',
        baNote: 'seeded:srs_proposal',
      };
    });
}

function g4RequirementsToFrList(g4Understanding) {
  const reqs = Array.isArray(g4Understanding?.requirements)
    ? g4Understanding.requirements
    : [];
  return reqs.map((r, i) => {
    const name = String(r.title || r.name || `Requirement ${i + 1}`).trim();
    const ac = String(r.ac || r.acceptanceCriteria || '').trim();
    return {
      externalId: String(r.id || r.externalId || `FR-G4-${i + 1}`).trim(),
      name: name || `Requirement ${i + 1}`,
      description: String(r.description || '').trim(),
      acceptanceCriteria: ac,
      priority: r.priority || 'Medium',
      moduleLabel: String(r.module || r.moduleLabel || '').trim(),
      featureLabel: String(r.feature || r.featureLabel || '').trim(),
      level: 'Requirement',
      parentExternalId: r.parentId || r.parentExternalId || null,
      source: 'g4_understanding_legacy',
      status: 'Draft',
    };
  });
}

function resolveFrSeedList(source) {
  if (!source || typeof source !== 'object') return [];
  if (source.generated?.functionalRequirements) return proposalFrToList(source);
  if (Array.isArray(source.requirements)) return g4RequirementsToFrList(source);
  return [];
}

/**
 * @returns {{ pack: object, meta: { seededFr: number, skipped: boolean, reason?: string } }}
 */
function materializeG4IntoPack(pack, g4OrProposal) {
  const next = pack && typeof pack === 'object' ? { ...pack } : {};
  const existing = Array.isArray(next.functionalRequirements)
    ? next.functionalRequirements
    : [];
  const seeded = resolveFrSeedList(g4OrProposal);
  if (!seeded.length) {
    return { pack: next, meta: { seededFr: 0, skipped: true, reason: 'no_fr_requirements' } };
  }
  if (existing.length === 0) {
    next.functionalRequirements = seeded;
    return { pack: next, meta: { seededFr: seeded.length, skipped: false } };
  }
  const byId = new Map(
    existing.map((r) => [String(r.externalId || r.id || '').trim(), { ...r }])
  );
  let filled = 0;
  for (const row of seeded) {
    const id = row.externalId;
    if (!byId.has(id)) {
      byId.set(id, row);
      filled += 1;
      continue;
    }
    const cur = byId.get(id);
    if (String(cur.level || '').toLowerCase() === 'requirement') {
      cur.level = 'Requirement';
    }
    if (!String(cur.name || '').trim() && row.name) {
      cur.name = row.name;
      filled += 1;
    }
    if (!String(cur.description || '').trim() && row.description) {
      cur.description = row.description;
      filled += 1;
    }
    const curAc = String(cur.acceptanceCriteria || cur.ac || '').trim();
    const rowAc = String(row.acceptanceCriteria || row.ac || '').trim();
    if (!curAc && rowAc) {
      cur.acceptanceCriteria = rowAc;
      filled += 1;
    }
    byId.set(id, cur);
  }
  next.functionalRequirements = Array.from(byId.values());
  return { pack: next, meta: { seededFr: filled, skipped: false, merged: true } };
}

const materializeProposalIntoPack = materializeG4IntoPack;

module.exports = {
  g4RequirementsToFrList,
  proposalFrToList,
  materializeG4IntoPack,
  materializeProposalIntoPack,
};
