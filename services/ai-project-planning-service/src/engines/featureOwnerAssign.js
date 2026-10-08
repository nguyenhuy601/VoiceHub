/**
 * Feature owner — best Fit owner per featureId; bias leaf shortlist toward owner (NOTE-2.3c).
 */

/**
 * @param {{
 *   tasks: object[],
 *   recommendations: Array<{ taskId: string, candidates?: object[], shortlist?: object[] }>,
 * }} args
 * @returns {{ featureOwners: Array<{ featureId: string, ownerUserId: string, fitScore: number }>, recommendations: object[] }}
 */
function assignFeatureOwners({ tasks = [], recommendations = [] } = {}) {
  const taskById = new Map(
    (tasks || []).map((t) => [String(t.id || t.taskId), t])
  );

  // featureId → Map userId → { fitScore sum, count, feasibleCount }
  const featureScores = new Map();

  for (const rec of recommendations || []) {
    const task = taskById.get(String(rec.taskId));
    const featureId = String(task?.featureId || '').trim();
    if (!featureId) continue;
    if (!featureScores.has(featureId)) featureScores.set(featureId, new Map());
    const userMap = featureScores.get(featureId);
    const cands = Array.isArray(rec.candidates)
      ? rec.candidates
      : Array.isArray(rec.shortlist)
        ? rec.shortlist
        : [];
    for (const c of cands) {
      if (!c?.userId) continue;
      if (c.feasible === false) continue;
      const prev = userMap.get(c.userId) || { fitSum: 0, count: 0 };
      prev.fitSum += Number(c.fitScore ?? c.score) || 0;
      prev.count += 1;
      userMap.set(c.userId, prev);
    }
  }

  const featureOwners = [];
  const ownerByFeature = new Map();
  for (const [featureId, userMap] of featureScores) {
    let best = null;
    for (const [userId, stats] of userMap) {
      const avg = stats.count ? stats.fitSum / stats.count : 0;
      if (!best || avg > best.fitScore || (avg === best.fitScore && userId < best.ownerUserId)) {
        best = { featureId, ownerUserId: userId, fitScore: Math.round(avg * 1000) / 1000 };
      }
    }
    if (best) {
      featureOwners.push(best);
      ownerByFeature.set(featureId, best.ownerUserId);
    }
  }
  featureOwners.sort((a, b) => a.featureId.localeCompare(b.featureId));

  // Bias leaf shortlists: boost owner to front when feasible
  const biased = (recommendations || []).map((rec) => {
    const task = taskById.get(String(rec.taskId));
    const featureId = String(task?.featureId || '').trim();
    const ownerId = featureId ? ownerByFeature.get(featureId) : null;
    const cands = [
      ...(Array.isArray(rec.candidates)
        ? rec.candidates
        : Array.isArray(rec.shortlist)
          ? rec.shortlist
          : []),
    ];
    if (!ownerId || !cands.length) {
      return {
        ...rec,
        candidates: cands,
        shortlist: cands,
      };
    }
    const owner = cands.find((c) => String(c.userId) === String(ownerId) && c.feasible !== false);
    if (!owner) {
      return { ...rec, candidates: cands, shortlist: cands };
    }
    const rest = cands.filter((c) => String(c.userId) !== String(ownerId));
    const ordered = [
      { ...owner, score: Math.min(1, (Number(owner.fitScore ?? owner.score) || 0) + 0.05) },
      ...rest,
    ];
    return {
      ...rec,
      preferredOwnerUserId: ownerId,
      candidates: ordered,
      shortlist: ordered,
    };
  });

  return { featureOwners, recommendations: biased };
}

module.exports = {
  assignFeatureOwners,
};
