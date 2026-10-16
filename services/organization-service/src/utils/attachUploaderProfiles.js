const { fetchProfilesByUserIds } = require('../clients/userProfilesBatch.client');

function normalizeProfile(row, userId) {
  const u = row || {};
  return {
    _id: userId,
    username: String(u.username || u.name || '').trim(),
    displayName: String(u.displayName || u.name || u.username || '').trim(),
    avatar: u.avatar ?? null,
  };
}

/**
 * Resolve uploader profiles without Mongoose populate (User model không đăng ký trong org).
 * @param {string[]} uploadedByIds
 * @returns {Promise<Map<string, object|null>>}
 */
async function resolveUploaderProfileMap(uploadedByIds) {
  const unique = [...new Set(uploadedByIds.map((id) => String(id || '').trim()).filter(Boolean))];
  const map = new Map();
  if (!unique.length) return map;

  const profiles = await fetchProfilesByUserIds(unique);
  for (const userId of unique) {
    const row = profiles.get(userId);
    map.set(userId, row ? normalizeProfile(row, userId) : null);
  }
  return map;
}

/**
 * @param {object|object[]} documents — lean doc(s)
 * @param {Map<string, object|null>} profileMap
 */
function attachUploadedByToDocuments(documents, profileMap) {
  const list = Array.isArray(documents) ? documents : [documents];
  return list.map((doc) => {
    if (!doc || typeof doc !== 'object') return doc;
    const out = { ...doc };
    const id = String(out.uploadedBy || '').trim();
    if (!id) return out;
    const profile = profileMap.get(id);
    if (profile) {
      out.uploadedBy = profile;
      out.uploadedByDisplayName = profile.displayName || profile.username || '';
    } else {
      out.uploadedByDisplayName = '';
    }
    return out;
  });
}

module.exports = {
  resolveUploaderProfileMap,
  attachUploadedByToDocuments,
};
