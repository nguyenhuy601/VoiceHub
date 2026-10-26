/**
 * PotentialConflict pair relations from NormalizedConstraintFact[] only.
 * No lexical keyword discovery.
 */

const { normalizeConstraintFact, SUPPORTED_CONSTRAINT_TYPES } = require('./normalizedConstraintFact');

function canonicalPairKey(frA, frB) {
  const a = String(frA || '').trim();
  const b = String(frB || '').trim();
  return [a, b].sort((x, y) => x.localeCompare(y)).join('::');
}

function actorsOf(policy) {
  const list = policy?.actors || policy?.value || [];
  return new Set(
    (Array.isArray(list) ? list : [list]).map((x) => String(x || '').trim().toUpperCase()).filter(Boolean)
  );
}

function modeOf(policy) {
  return String(policy?.mode || '').toUpperCase();
}

/**
 * Deterministic actor_policy incompatibility (structured facts only).
 */
function actorPoliciesIncompatible(a, b) {
  const modeA = modeOf(a);
  const modeB = modeOf(b);
  const setA = actorsOf(a);
  const setB = actorsOf(b);
  if (!setA.size || !setB.size) return false;

  // ALLOW_ONLY[X] vs ALLOW[Y] where Y not subset of X
  if (modeA === 'ALLOW_ONLY' && modeB === 'ALLOW') {
    for (const actor of setB) {
      if (!setA.has(actor)) return true;
    }
  }
  if (modeB === 'ALLOW_ONLY' && modeA === 'ALLOW') {
    for (const actor of setA) {
      if (!setB.has(actor)) return true;
    }
  }
  // Two ALLOW_ONLY with disjoint actor sets
  if (modeA === 'ALLOW_ONLY' && modeB === 'ALLOW_ONLY') {
    const same =
      setA.size === setB.size && [...setA].every((x) => setB.has(x));
    if (!same) return true;
  }
  return false;
}

function factsIncompatible(fa, fb) {
  if (fa.constraintType !== fb.constraintType) return false;
  if (fa.constraintType === 'actor_policy') {
    return actorPoliciesIncompatible(fa.constraintValue, fb.constraintValue);
  }
  return false;
}

/**
 * @param {object[]} rawFacts
 * @returns {{ relations: object[], pairCount: number, affectedFrCount: number }}
 */
function buildPotentialConflictRelations(rawFacts = []) {
  const facts = (Array.isArray(rawFacts) ? rawFacts : [])
    .map((f) => normalizeConstraintFact(f))
    .filter(Boolean);

  const byTarget = new Map();
  for (const fact of facts) {
    if (!SUPPORTED_CONSTRAINT_TYPES.includes(fact.constraintType)) continue;
    const key = `${fact.targetKey}::${fact.constraintType}`;
    if (!byTarget.has(key)) byTarget.set(key, []);
    byTarget.get(key).push(fact);
  }

  const seen = new Set();
  const relations = [];
  for (const group of byTarget.values()) {
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        const fa = group[i];
        const fb = group[j];
        if (fa.frId === fb.frId) continue;
        if (!factsIncompatible(fa, fb)) continue;
        const pairKey = canonicalPairKey(fa.frId, fb.frId);
        if (seen.has(pairKey)) continue;
        seen.add(pairKey);
        const frIds = [fa.frId, fb.frId].sort((x, y) => x.localeCompare(y));
        relations.push({
          pairKey,
          frIds,
          targetKey: fa.targetKey,
          constraintType: fa.constraintType,
          relation: 'incompatible',
          evidence: [
            `fact:${fa.frId}:${fa.constraintType}`,
            `fact:${fb.frId}:${fb.constraintType}`,
          ],
        });
      }
    }
  }

  const affected = new Set();
  for (const rel of relations) {
    for (const id of rel.frIds) affected.add(id);
  }

  return {
    relations,
    pairCount: relations.length,
    affectedFrCount: affected.size,
  };
}

module.exports = {
  canonicalPairKey,
  actorPoliciesIncompatible,
  buildPotentialConflictRelations,
};
