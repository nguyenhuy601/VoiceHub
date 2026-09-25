/**
 * Seed pack functionalRequirements from G4 understanding when FR tree is thin.
 * Pure — no Mongo.
 */

function g4RequirementsToFrList(g4Understanding) {
  const reqs = Array.isArray(g4Understanding?.requirements)
    ? g4Understanding.requirements
    : [];
  return reqs.map((r, i) => ({
    externalId: String(r.id || r.externalId || `FR-G4-${i + 1}`).trim(),
    name: r.title || r.name || `Requirement ${i + 1}`,
    title: r.title || r.name || null,
    description: r.description || '',
    ac: r.ac || r.acceptanceCriteria || '',
    priority: r.priority || '',
    module: r.module || '',
    feature: r.feature || '',
    level: r.level || 'Requirement',
    parentExternalId: r.parentId || r.parentExternalId || null,
    source: 'g4_understanding',
  }));
}

/**
 * Apply G4 materialize onto a plain pack object (clone sheets).
 * @returns {{ pack: object, meta: { seededFr: number, skipped: boolean, reason?: string } }}
 */
function materializeG4IntoPack(pack, g4Understanding) {
  const next = pack && typeof pack === 'object' ? { ...pack } : {};
  const existing = Array.isArray(next.functionalRequirements)
    ? next.functionalRequirements
    : [];
  const seeded = g4RequirementsToFrList(g4Understanding);
  if (!seeded.length) {
    return { pack: next, meta: { seededFr: 0, skipped: true, reason: 'no_g4_requirements' } };
  }
  // Prefer G4 list when pack FR empty or only placeholders
  if (existing.length === 0) {
    next.functionalRequirements = seeded;
    return { pack: next, meta: { seededFr: seeded.length, skipped: false } };
  }
  // Merge by externalId — fill missing descriptions from G4
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
    if (!String(cur.description || '').trim() && row.description) {
      cur.description = row.description;
      filled += 1;
    }
    if (!String(cur.ac || '').trim() && row.ac) {
      cur.ac = row.ac;
      filled += 1;
    }
    byId.set(id, cur);
  }
  next.functionalRequirements = Array.from(byId.values());
  return { pack: next, meta: { seededFr: filled, skipped: false, merged: true } };
}

module.exports = {
  g4RequirementsToFrList,
  materializeG4IntoPack,
};
