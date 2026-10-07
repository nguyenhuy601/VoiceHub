const FRIEND_SEARCH_FIELDS = ['_id', 'userId', 'username', 'displayName', 'name', 'avatar'];

/**
 * Whitelist for GET /api/friends/search — only fields AddFriendModal renders.
 * @param {object|null|undefined} userData
 * @returns {object|null}
 */
function pickFriendSearchProfile(userData) {
  if (!userData || typeof userData !== 'object') return null;
  const out = {};
  for (const key of FRIEND_SEARCH_FIELDS) {
    if (userData[key] !== undefined && userData[key] !== null) out[key] = userData[key];
  }
  return out;
}

module.exports = { pickFriendSearchProfile, FRIEND_SEARCH_FIELDS };
