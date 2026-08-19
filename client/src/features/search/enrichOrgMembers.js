import userService from '../../services/userService';
import { resolveEnrichedMemberContact } from './enrichOrgMembersContact';

export { resolveEnrichedMemberContact } from './enrichOrgMembersContact';

const unwrapBody = (payload) => payload?.data ?? payload;

export function memberUserId(m) {
  const u = m?.user;
  if (u && typeof u === 'object') return String(u._id || u.id || u.userId || '');
  return String(u || m?.userId || '').trim();
}

function unwrapProfile(res) {
  const u = unwrapBody(res)?.data ?? unwrapBody(res);
  return u?.data ?? u;
}

/**
 * Membership (org API, user = ObjectId) → hàng có displayName / email / avatar.
 * Dùng chung People admin, ACL, sidebar, search.
 */
export async function enrichMembershipsWithProfiles(members, options = {}) {
  const fallback = String(options.fallback || '—');
  const limit = Number.isFinite(options.limit) ? options.limit : Infinity;
  const list = Array.isArray(members) ? members : [];
  const slice = Number.isFinite(limit) ? list.slice(0, Math.max(0, limit)) : list;

  return Promise.all(
    slice.map(async (m) => {
      const uid = memberUserId(m);
      let profile = null;
      if (uid) {
        try {
          profile = unwrapProfile(await userService.getProfile(uid));
        } catch {
          /* giữ membership / fallback */
        }
      }
      const contact = resolveEnrichedMemberContact(profile, m, {
        fallback,
        userId: uid,
      });
      return {
        membershipId: String(m?._id || m?.id || ''),
        userId: uid,
        role: String(m?.role || 'member').toLowerCase(),
        divisionId: m?.division ? String(m.division) : '',
        departmentId: String(m?.departmentId || m?.department || '').trim(),
        teamId: String(m?.teamId || m?.team || '').trim(),
        displayName: contact.displayName,
        email: contact.email,
        username: contact.username,
        avatar: contact.avatar,
        raw: m,
      };
    })
  );
}

/**
 * Membership → hàng search (giữ API cũ).
 */
export async function enrichMembershipsForSearch(members) {
  const rows = await enrichMembershipsWithProfiles(
    Array.isArray(members)
      ? members.filter((m) => String(m?.status || 'active') === 'active')
      : []
  );
  return rows.map((row) => ({
    membershipId: row.membershipId,
    userId: row.userId,
    role: row.role,
    displayName: row.displayName,
    username: row.username,
    avatar: row.avatar,
    raw: row.raw,
  }));
}

/**
 * Batch profile theo danh sách userId (ACL access rows, v.v.).
 */
export async function enrichUserIdsWithProfiles(userIds, options = {}) {
  const fallback = String(options.fallback || '—');
  const ids = [...new Set((userIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
  const entries = await Promise.all(
    ids.map(async (uid) => {
      let displayName = uid.slice(-6) || fallback;
      let email = '';
      try {
        const profile = unwrapProfile(await userService.getProfile(uid));
        displayName =
          profile?.displayName ||
          profile?.fullName ||
          profile?.username ||
          (profile?.email ? String(profile.email).split('@')[0] : '') ||
          displayName;
        email = String(profile?.email || '').trim();
      } catch {
        /* */
      }
      return [uid, { displayName, email }];
    })
  );
  return Object.fromEntries(entries);
}
