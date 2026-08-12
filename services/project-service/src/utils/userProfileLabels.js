function unwrapSingleProfile(res) {
  return res?.data?.data ?? res?.data ?? null;
}

function labelFromProfile(uid, profile) {
  const id = String(uid || '');
  const fallback = id.slice(-6) || '—';
  const src = profile && typeof profile === 'object' ? profile : null;
  const email = String(src?.email || '').trim();
  const displayName =
    src?.displayName ||
    src?.fullName ||
    src?.username ||
    (email.includes('@') ? email.split('@')[0] : '') ||
    fallback;
  return {
    displayName: String(displayName),
    avatar: src?.avatar || null,
    email,
    username: src?.username || null,
  };
}

async function loadProfileMap(userIds, deps = {}) {
  const unique = [...new Set((userIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
  const map = new Map();
  if (!unique.length) return map;

  const fetchBatch =
    deps.fetchProfilesByUserIds ||
    require('../clients/userProfilesBatch.client').fetchProfilesByUserIds;
  const fetchOne =
    deps.fetchUserProfileByIdInternal ||
    require('../clients/userService.client').fetchUserProfileByIdInternal;

  const batched = await fetchBatch(unique);
  if (batched && typeof batched.forEach === 'function') {
    batched.forEach((row, id) => {
      if (id) map.set(String(id), row);
    });
  }

  const missing = unique.filter((id) => !map.has(id));
  if (!missing.length) return map;

  await Promise.all(
    missing.map(async (uid) => {
      try {
        const res = await fetchOne(uid);
        const profile = unwrapSingleProfile(res);
        if (profile) map.set(uid, profile);
      } catch {
        /* optional — giữ fallback mã ngắn */
      }
    })
  );
  return map;
}

/**
 * Hydrate displayName/avatar cho roster — một batch S2S, fallback từng id nếu thiếu.
 * @param {string[]} userIds
 * @param {object} [deps]
 * @returns {Promise<Map<string, { displayName: string, avatar: string|null, email: string, username: string|null }>>}
 */
async function enrichMembershipUserLabels(userIds = [], deps = {}) {
  const unique = [...new Set((userIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
  const profileMap = await loadProfileMap(unique, deps);
  return new Map(unique.map((uid) => [uid, labelFromProfile(uid, profileMap.get(uid))]));
}

/**
 * Cùng batch profile cho assignable-members (contract rows không đổi).
 */
async function enrichAssignableProfiles(userIds = [], _actorId, deps = {}) {
  const unique = [...new Set((userIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
  const profileMap = await loadProfileMap(unique, deps);
  return unique
    .map((uid) => {
      const label = labelFromProfile(uid, profileMap.get(uid));
      return {
        userId: uid,
        displayName: label.displayName,
        avatar: label.avatar || '',
        username: label.username || '',
      };
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName, 'vi'));
}

module.exports = {
  labelFromProfile,
  enrichMembershipUserLabels,
  enrichAssignableProfiles,
};
