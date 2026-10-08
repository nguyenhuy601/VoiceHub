function membershipEmail(m) {
  return String(m?.email || '').trim();
}

function membershipDisplayName(m) {
  return String(m?.displayName || m?.fullName || '').trim();
}

/** Profile + membership org → email/tên; ưu tiên email org, không phụ thuộc peer profile.email. */
export function resolveEnrichedMemberContact(profile, membership = {}, options = {}) {
  const fallback = String(options.fallback || '—');
  const userId = String(options.userId || '').trim();
  const orgEmail = membershipEmail(membership);
  const profileEmail = String(profile?.email || '').trim();
  // Org/membership first — peer profiles may omit email after info-sec whitelist.
  const email = orgEmail || profileEmail;
  const profileName = String(
    profile?.displayName || profile?.fullName || profile?.username || ''
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
