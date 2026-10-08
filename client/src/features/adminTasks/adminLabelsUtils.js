/**
 * Gom nhãn (`card.tags`) của các thẻ trên board: trim, bỏ rỗng, gộp không phân biệt hoa/thường
 * (giữ cách viết gặp đầu tiên), sắp theo số thẻ giảm dần rồi theo tên.
 * @param {Array<{ tags?: unknown[] }>} cards
 * @returns {Array<{ label: string, count: number }>}
 */
export function aggregateBoardLabels(cards) {
  const byKey = new Map();
  for (const card of Array.isArray(cards) ? cards : []) {
    const seenOnCard = new Set();
    for (const raw of Array.isArray(card?.tags) ? card.tags : []) {
      const label = String(raw ?? '').trim();
      if (!label) continue;
      const key = label.toLowerCase();
      if (seenOnCard.has(key)) continue;
      seenOnCard.add(key);
      const entry = byKey.get(key);
      if (entry) entry.count += 1;
      else byKey.set(key, { label, count: 1 });
    }
  }
  return [...byKey.values()].sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label)
  );
}
