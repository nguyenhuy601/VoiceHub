function normalizeIds(ids) {
  const seen = new Set();
  const out = [];
  for (const raw of Array.isArray(ids) ? ids : []) {
    const id = String(raw ?? '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** So sánh danh sách thành viên trước/sau → payload delta cho PUT team (membersAdd/membersRemove). */
export function diffMemberSets(previousIds, nextIds) {
  const prev = normalizeIds(previousIds);
  const next = normalizeIds(nextIds);
  const prevSet = new Set(prev);
  const nextSet = new Set(next);
  return {
    added: next.filter((id) => !prevSet.has(id)),
    removed: prev.filter((id) => !nextSet.has(id)),
  };
}

export function hasMemberChanges(diff) {
  return Boolean(diff && (diff.added.length || diff.removed.length));
}
