const Department = require('../models/Department');
const Team = require('../models/Team');

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function nameEqualsCiFilter(name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return null;
  return { $regex: `^${escapeRegex(trimmed)}$`, $options: 'i' };
}

/**
 * Phòng ban active trùng tên trong cùng khối (hoặc root khi không có division).
 * @returns {Promise<object|null>} document trùng nếu có
 */
async function findActiveDepartmentNameConflict({ organizationId, divisionId, name, excludeId = null }) {
  const nameFilter = nameEqualsCiFilter(name);
  if (!nameFilter || !organizationId) return null;
  const query = {
    organization: organizationId,
    isActive: { $ne: false },
    name: nameFilter,
  };
  if (divisionId) query.division = divisionId;
  else query.$or = [{ division: null }, { division: { $exists: false } }];
  if (excludeId) query._id = { $ne: excludeId };
  return Department.findOne(query).select('_id name division').lean();
}

/**
 * Team active trùng tên trong cùng phòng ban (hoặc cùng khối khi không có department).
 */
async function findActiveTeamNameConflict({
  organizationId,
  departmentId = null,
  divisionId = null,
  name,
  excludeId = null,
}) {
  const nameFilter = nameEqualsCiFilter(name);
  if (!nameFilter || !organizationId) return null;
  const query = {
    organization: organizationId,
    isActive: true,
    name: nameFilter,
  };
  if (departmentId) {
    query.department = departmentId;
  } else if (divisionId) {
    query.division = divisionId;
    query.$or = [{ department: null }, { department: { $exists: false } }];
  } else {
    query.$and = [
      { $or: [{ department: null }, { department: { $exists: false } }] },
      { $or: [{ division: null }, { division: { $exists: false } }] },
    ];
  }
  if (excludeId) query._id = { $ne: excludeId };
  return Team.findOne(query).select('_id name department division').lean();
}

module.exports = {
  findActiveDepartmentNameConflict,
  findActiveTeamNameConflict,
};
