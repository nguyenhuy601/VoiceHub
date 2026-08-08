/**
 * Chạy async mapper với trần concurrency (không unbounded Promise.all).
 * @template T, R
 * @param {T[]} items
 * @param {number} concurrency
 * @param {(item: T, index: number) => Promise<R>} mapper
 * @returns {Promise<R[]>}
 */
async function runWithConcurrency(items, concurrency, mapper) {
  const list = Array.isArray(items) ? items : [];
  const limit = Math.max(1, Math.min(50, Math.floor(Number(concurrency) || 1)));
  const results = new Array(list.length);
  let nextIndex = 0;

  async function worker() {
    for (;;) {
      const i = nextIndex;
      nextIndex += 1;
      if (i >= list.length) return;
      results[i] = await mapper(list[i], i);
    }
  }

  const workers = Array.from({ length: Math.min(limit, list.length || 1) }, () => worker());
  await Promise.all(workers);
  return results;
}

/**
 * Chia mảng thành các chunk cố định.
 * @template T
 * @param {T[]} items
 * @param {number} size
 * @returns {T[][]}
 */
function chunkArray(items, size) {
  const list = Array.isArray(items) ? items : [];
  const n = Math.max(1, Math.floor(Number(size) || 1));
  const out = [];
  for (let i = 0; i < list.length; i += n) {
    out.push(list.slice(i, i + n));
  }
  return out;
}

module.exports = {
  runWithConcurrency,
  chunkArray,
};
