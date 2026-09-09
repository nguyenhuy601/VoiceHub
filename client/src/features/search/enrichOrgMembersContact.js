function membershipEmail(m) {
  return String(m?.email || '').trim();
}

function membershipDisplayName(m) {
  return String(m?.displayName || m?.fullName || '').trim();
}

/** Profile + membership org → email/tên; không ghi đè email org khi profile trống. */
export function resolveEnrichedMemberContact(profile, membership = {}, options = {}) {
  const fallback = String(options.fallback || '—');
  const userId = String(options.userId || '').trim();
  const profileEmail = String(profile?.email || '').trim();
  const email = profileEmail || membershipEmail(membership);
  const profileName = String(
    profile?.displayName ||
      profile?.fullName ||
      profile?.username ||
      (profileEmail ? profileEmail.split('@')[0] : '') ||
      ''
  ).trim();
  const displayName =
    profileName ||
    membershipDisplayName(membership) ||
    (email ? email.split('@')[0] : '') ||
    (userId ? userId.slice(-6) : fallback);
  return {
    displayName,
    email,
    avatar: profile?.avatar ?? membership?.avatar ?? null,
    username: profile?.username || membership?.username || null,
  };
}
