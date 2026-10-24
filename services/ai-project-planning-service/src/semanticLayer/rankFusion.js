/**
 * Reciprocal rank fusion for optional hits only.
 * Required records never enter this ranking (RULE-SL-08).
 */

function reciprocalRankFusion(lists = [], k = 60) {
  const scores = new Map();
  for (const list of lists) {
    (list || []).forEach((item, index) => {
      const key = String(item.dedupeKey || item.id || '');
      if (!key) return;
      const prev = scores.get(key) || { item, score: 0 };
      prev.score += 1 / (k + index + 1);
      if (!prev.item) prev.item = item;
      scores.set(key, prev);
    });
  }
  return [...scores.values()].sort(
    (left, right) =>
      right.score - left.score ||
      String(left.item.id).localeCompare(String(right.item.id))
  );
}

module.exports = {
  reciprocalRankFusion,
};
