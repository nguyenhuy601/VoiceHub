/**
 * Roster team trên workspace: lọc theo placement teamId hoặc Team.members / leader.
 */

export function collectTeamMemberIds(team) {
  const ids = new Set();
  (team?.members || []).forEach((member) => {
    const id =
      member == null || member === ''
        ? ''
        : typeof member === 'object'
          ? String(member._id || member.id || member.userId || '')
          : String(member);
    if (id) ids.add(id);
  });
  const leader =
    team?.leader == null || team?.leader === ''
      ? ''
      : typeof team.leader === 'object'
        ? String(team.leader._id || team.leader.id || team.leader.userId || '')
        : String(team.leader);
  if (leader) ids.add(leader);
  return ids;
}

function memberUserId(member) {
  if (!member || typeof member !== 'object') return String(member || '').trim();
  const nested = member.user;
  if (nested && typeof nested === 'object') {
    return String(nested._id || nested.id || nested.userId || '').trim();
  }
  return String(
    member.userId || member._id || member.id || nested || ''
  ).trim();
}

function memberTeamId(member) {
  if (!member || typeof member !== 'object') return '';
  const raw = member.raw && typeof member.raw === 'object' ? member.raw : {};
  return String(
    member.teamId || member.team || raw.teamId || raw.team || ''
  ).trim();
}

function idFromRef(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'object') {
    return String(value._id || value.id || '').trim();
  }
  return String(value).trim();
}

export function teamDepartmentId(team) {
  if (!team || typeof team !== 'object') return '';
  return idFromRef(team.departmentId || team.department);
}

export function memberDepartmentId(member) {
  if (!member || typeof member !== 'object') return '';
  const raw = member.raw && typeof member.raw === 'object' ? member.raw : {};
  return (
    idFromRef(member.departmentId) ||
    idFromRef(raw.departmentId) ||
    idFromRef(member.department) ||
    idFromRef(raw.department)
  );
}

/**
 * @param {object} member
 * @param {string} teamId
 * @param {object|null|undefined} team
 */
export function isMemberInTeam(member, teamId, team) {
  const tid = String(teamId || '').trim();
  if (!tid) return true;
  if (memberTeamId(member) === tid) return true;
  const uid = memberUserId(member);
  if (!uid) return false;
  return collectTeamMemberIds(team).has(uid);
}

/**
 * Khi không có teamId: giữ nguyên danh sách org/dept.
 * @param {object[]} members
 * @param {string} teamId
 * @param {object|null|undefined} team
 */
export function filterMembersForTeam(members, teamId, team) {
  const list = Array.isArray(members) ? members : [];
  const tid = String(teamId || '').trim();
  if (!tid) return list;
  return list.filter((row) => isMemberInTeam(row, tid, team));
}

/**
 * Ứng viên thêm vào team: chưa thuộc roster; nếu team có phòng ban thì chỉ cùng dept.
 */
export function filterAddTeamMemberCandidates(members, teamId, team) {
  const list = Array.isArray(members) ? members : [];
  const tid = String(teamId || '').trim();
  const deptId = teamDepartmentId(team);
  return list.filter((row) => {
    const uid = memberUserId(row);
    if (!uid) return false;
    if (tid && isMemberInTeam(row, tid, team)) return false;
    if (!deptId) return true;
    return memberDepartmentId(row) === deptId;
  });
}
