/** Map orgId → số membership active từ kết quả $group. */
function membershipCountMap(aggRows) {
  const map = {};
  (Array.isArray(aggRows) ? aggRows : []).forEach((row) => {
    const id = String(row?._id || '').trim();
    if (!id) return;
    const n = Number(row?.n);
    map[id] = Number.isFinite(n) ? n : 0;
  });
  return map;
}

module.exports = { membershipCountMap };
