/**
 * Semantic merge — Unified Canonical links FR ↔ skill / tech / role (deterministic).
 */

function ensureFrEntry(byFr, frId) {
  let entry = byFr.get(frId);
  if (!entry) {
    entry = {
      frId,
      skillCanonicalIds: [],
      techCanonicalIds: [],
      roleCanonicalIds: [],
    };
    byFr.set(frId, entry);
  }
  return entry;
}

function pushUnique(arr, id) {
  if (!id || id.endsWith('UNMAPPED')) return false;
  if (arr.includes(id)) return false;
  arr.push(id);
  return true;
}

/**
 * @param {object} canonical — from canonicalizeProjected
 */
function semanticMerge(canonical = {}) {
  const links = [];
  const byFr = new Map();

  for (const ref of canonical.requirementSkills || []) {
    const frId = String(ref.externalId || '').trim();
    if (!frId) continue;
    const skillId = ref.skillCanonicalId || null;
    const entry = ensureFrEntry(byFr, frId);
    if (pushUnique(entry.skillCanonicalIds, skillId)) {
      links.push({
        from: frId,
        to: skillId,
        kind: 'fr_skill',
        importance: ref.importance || 'required',
      });
    }
  }

  for (const fr of canonical.fr || []) {
    const frId = String(fr.externalId || '').trim();
    if (!frId) continue;
    const entry = ensureFrEntry(byFr, frId);
    for (const sk of fr.skillCanonicalIds || []) {
      if (pushUnique(entry.skillCanonicalIds, sk)) {
        links.push({ from: frId, to: sk, kind: 'fr_skill', importance: 'suggested' });
      }
    }
    if (pushUnique(entry.roleCanonicalIds, fr.roleCanonical)) {
      links.push({ from: frId, to: fr.roleCanonical, kind: 'fr_role' });
    }
  }

  const techList = canonical.technology || [];
  for (const fr of canonical.fr || []) {
    const frId = String(fr.externalId || '').trim();
    if (!frId) continue;
    const blob = `${fr.name || ''} ${fr.description || ''}`.toLowerCase();
    const entry = ensureFrEntry(byFr, frId);
    for (const t of techList) {
      const name = String(t.name || '').toLowerCase();
      const techId = t.techCanonicalId;
      if (name && blob.includes(name) && pushUnique(entry.techCanonicalIds, techId)) {
        links.push({ from: frId, to: techId, kind: 'fr_tech' });
      }
    }
  }

  // Mandatory tech → attach to all Requirement-level FR when no FR-specific tech yet
  const mandatoryTech = techList
    .filter((t) => t.mandatory && t.techCanonicalId && t.techCanonicalId !== 'TECH-UNMAPPED')
    .map((t) => t.techCanonicalId);
  if (mandatoryTech.length) {
    for (const fr of canonical.fr || []) {
      if (String(fr.level || '') !== 'Requirement' && fr.level) continue;
      const frId = String(fr.externalId || '').trim();
      if (!frId) continue;
      const entry = ensureFrEntry(byFr, frId);
      for (const techId of mandatoryTech) {
        if (pushUnique(entry.techCanonicalIds, techId)) {
          links.push({ from: frId, to: techId, kind: 'fr_tech', importance: 'mandatory' });
        }
      }
    }
  }

  const requiredSkillIds = (canonical.staffing?.requiredSkills || [])
    .map((s) => s.skillCanonicalId)
    .filter((id) => id && id !== 'SK-UNMAPPED');
  const requiredRoleIds = (canonical.staffing?.requiredRoles || [])
    .map((r) => r.roleCanonicalId)
    .filter((id) => id && id !== 'ROLE-UNMAPPED');

  return {
    frLinks: [...byFr.values()],
    edges: links,
    requiredSkillIds: [...new Set(requiredSkillIds)],
    requiredRoleIds: [...new Set(requiredRoleIds)],
  };
}

module.exports = {
  semanticMerge,
};
