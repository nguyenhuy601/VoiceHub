const orgRbac = require('../services/orgRbacMatrix.service');
const { orgValidation, orgCatch, orgFail } = require('../utils/orgApiError');

function sendData(res, data, status = 200) {
  return res.status(status).json({ success: true, data });
}

/** FE legacy aliases: key/label (roles), title (positions). */
function roleView(row) {
  if (!row) return row;
  return {
    ...row,
    id: String(row._id),
    key: row.code,
    label: row.name,
  };
}

function positionView(row) {
  if (!row) return row;
  return {
    ...row,
    id: String(row._id),
    key: row.code,
    title: row.name,
  };
}

function handleError(res, error) {
  if (error?.statusCode) {
    return orgFail(res, error.statusCode, error.message, error.errorCode || 'ORG_RBAC_FAILED');
  }
  return orgCatch(res, error);
}

/* Roles */
async function listRoles(req, res) {
  try {
    const orgId = String(req.params.orgId || '').trim();
    if (!orgId) return orgValidation(res, 'organizationId bắt buộc');
    const roles = await orgRbac.listRoles(orgId, {
      includeDisabled: String(req.query.includeDisabled || '') === '1',
    });
    return sendData(res, { roles: roles.map(roleView) });
  } catch (error) {
    return handleError(res, error);
  }
}

async function createRole(req, res) {
  try {
    const orgId = String(req.params.orgId || '').trim();
    if (!orgId) return orgValidation(res, 'organizationId bắt buộc');
    const body = req.body || {};
    const role = await orgRbac.createRole(orgId, {
      code: body.code || body.key,
      name: body.name || body.label,
      description: body.description,
      sortOrder: body.sortOrder,
    });
    return sendData(res, { role: roleView(role) }, 201);
  } catch (error) {
    return handleError(res, error);
  }
}

async function updateRole(req, res) {
  try {
    const orgId = String(req.params.orgId || '').trim();
    const roleId = String(req.params.roleId || '').trim();
    if (!orgId || !roleId) return orgValidation(res, 'organizationId và roleId bắt buộc');
    const body = req.body || {};
    const role = await orgRbac.updateRole(orgId, roleId, {
      code: body.code || body.key,
      name: body.name || body.label,
      description: body.description,
      status: body.status,
      sortOrder: body.sortOrder,
    });
    return sendData(res, { role: roleView(role) });
  } catch (error) {
    return handleError(res, error);
  }
}

async function deleteRole(req, res) {
  try {
    const orgId = String(req.params.orgId || '').trim();
    const roleId = String(req.params.roleId || '').trim();
    if (!orgId || !roleId) return orgValidation(res, 'organizationId và roleId bắt buộc');
    await orgRbac.deleteRole(orgId, roleId);
    return sendData(res, { deleted: true });
  } catch (error) {
    return handleError(res, error);
  }
}

async function reorderRoles(req, res) {
  try {
    const orgId = String(req.params.orgId || '').trim();
    if (!orgId) return orgValidation(res, 'organizationId bắt buộc');
    const orderedIds = req.body?.orderedIds || [];
    const roles = await orgRbac.reorderRoles(orgId, orderedIds);
    return sendData(res, { roles: roles.map(roleView) });
  } catch (error) {
    return handleError(res, error);
  }
}

async function getRoleMatrix(req, res) {
  try {
    const orgId = String(req.params.orgId || '').trim();
    const roleId = String(req.params.roleId || '').trim();
    if (!orgId || !roleId) return orgValidation(res, 'organizationId và roleId bắt buộc');
    const data = await orgRbac.getRolePermissionMatrix(orgId, roleId);
    return sendData(res, data);
  } catch (error) {
    return handleError(res, error);
  }
}

async function putRoleMatrix(req, res) {
  try {
    const orgId = String(req.params.orgId || '').trim();
    const roleId = String(req.params.roleId || '').trim();
    if (!orgId || !roleId) return orgValidation(res, 'organizationId và roleId bắt buộc');
    const entries = req.body?.permissions || req.body?.entries || [];
    const data = await orgRbac.replaceRolePermissionMatrix(orgId, roleId, entries);
    return sendData(res, data);
  } catch (error) {
    return handleError(res, error);
  }
}

/* Positions */
async function listPositions(req, res) {
  try {
    const orgId = String(req.params.orgId || '').trim();
    if (!orgId) return orgValidation(res, 'organizationId bắt buộc');
    const positions = await orgRbac.listPositions(orgId, {
      includeDisabled: String(req.query.includeDisabled || '') === '1',
    });
    return sendData(res, { positions: positions.map(positionView) });
  } catch (error) {
    return handleError(res, error);
  }
}

async function createPosition(req, res) {
  try {
    const orgId = String(req.params.orgId || '').trim();
    if (!orgId) return orgValidation(res, 'organizationId bắt buộc');
    const body = req.body || {};
    const position = await orgRbac.createPosition(orgId, {
      code: body.code || body.key,
      name: body.name || body.title,
      description: body.description,
      sortOrder: body.sortOrder,
    });
    return sendData(res, { position: positionView(position) }, 201);
  } catch (error) {
    return handleError(res, error);
  }
}

async function updatePosition(req, res) {
  try {
    const orgId = String(req.params.orgId || '').trim();
    const positionId = String(req.params.positionId || '').trim();
    if (!orgId || !positionId) return orgValidation(res, 'organizationId và positionId bắt buộc');
    const body = req.body || {};
    const position = await orgRbac.updatePosition(orgId, positionId, {
      code: body.code || body.key,
      name: body.name || body.title,
      description: body.description,
      status: body.status,
      sortOrder: body.sortOrder,
    });
    return sendData(res, { position: positionView(position) });
  } catch (error) {
    return handleError(res, error);
  }
}

async function deletePosition(req, res) {
  try {
    const orgId = String(req.params.orgId || '').trim();
    const positionId = String(req.params.positionId || '').trim();
    if (!orgId || !positionId) return orgValidation(res, 'organizationId và positionId bắt buộc');
    await orgRbac.deletePosition(orgId, positionId);
    return sendData(res, { deleted: true });
  } catch (error) {
    return handleError(res, error);
  }
}

async function getPositionBindings(req, res) {
  try {
    const orgId = String(req.params.orgId || '').trim();
    const positionId = String(req.params.positionId || '').trim();
    if (!orgId || !positionId) return orgValidation(res, 'organizationId và positionId bắt buộc');
    const data = await orgRbac.getPositionRoleBindings(orgId, positionId);
    return sendData(res, data);
  } catch (error) {
    return handleError(res, error);
  }
}

async function putPositionBindings(req, res) {
  try {
    const orgId = String(req.params.orgId || '').trim();
    const positionId = String(req.params.positionId || '').trim();
    if (!orgId || !positionId) return orgValidation(res, 'organizationId và positionId bắt buộc');
    const roleIds = req.body?.roleIds || [];
    const data = await orgRbac.replacePositionRoleBindings(orgId, positionId, roleIds);
    return sendData(res, data);
  } catch (error) {
    return handleError(res, error);
  }
}

/* Assignments */
async function listAssignments(req, res) {
  try {
    const orgId = String(req.params.orgId || '').trim();
    if (!orgId) return orgValidation(res, 'organizationId bắt buộc');
    const assignments = await orgRbac.listAssignments(orgId, {
      userId: req.query.userId || null,
      status: req.query.status || 'active',
    });
    return sendData(res, { assignments });
  } catch (error) {
    return handleError(res, error);
  }
}

async function assignPosition(req, res) {
  try {
    const orgId = String(req.params.orgId || '').trim();
    if (!orgId) return orgValidation(res, 'organizationId bắt buộc');
    const assignment = await orgRbac.assignPositionToUser(orgId, req.body || {});
    return sendData(res, { assignment }, 201);
  } catch (error) {
    return handleError(res, error);
  }
}

async function endAssignment(req, res) {
  try {
    const orgId = String(req.params.orgId || '').trim();
    const assignmentId = String(req.params.assignmentId || '').trim();
    if (!orgId || !assignmentId) return orgValidation(res, 'organizationId và assignmentId bắt buộc');
    const assignment = await orgRbac.endAssignment(orgId, assignmentId);
    return sendData(res, { assignment });
  } catch (error) {
    return handleError(res, error);
  }
}

/** Internal / debug: effective grants for user */
async function resolveEffectiveGrants(req, res) {
  try {
    const orgId = String(req.params.orgId || req.params.organizationId || '').trim();
    const userId = String(req.params.userId || '').trim();
    if (!orgId || !userId) return orgValidation(res, 'organizationId và userId bắt buộc');
    const data = await orgRbac.resolveEffectiveGrants(orgId, userId);
    return sendData(res, data);
  } catch (error) {
    return handleError(res, error);
  }
}

module.exports = {
  listRoles,
  createRole,
  updateRole,
  deleteRole,
  reorderRoles,
  getRoleMatrix,
  putRoleMatrix,
  listPositions,
  createPosition,
  updatePosition,
  deletePosition,
  getPositionBindings,
  putPositionBindings,
  listAssignments,
  assignPosition,
  endAssignment,
  resolveEffectiveGrants,
};
