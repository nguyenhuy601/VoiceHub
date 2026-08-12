const MSG_NOT_ON_PROJECT = 'Người giao và người nhận phải cùng thuộc Project (Project Team)';
const MSG_NO_CAN_ASSIGN = 'Project Role hiện tại không có quyền Assign trên project này';

/**
 * Quyết định gán việc thuần (không I/O) sau khi đã có roles + graph.
 *
 * - Thiếu role trên project → deny.
 * - Actor.canAssign → allow (Hub Members = có thể gán). Graph không chặn
 *   Scrum Master / PO / … khi template chưa có cạnh tới DevOps, FE, v.v.
 * - Không canAssign nhưng có Delegation Edge → allow (đường bổ sung).
 * - Còn lại → deny.
 */
function decideAssign({
  actorRoles = [],
  targetRoles = [],
  actorCanAssign = false,
  edgeCount = 0,
  hasEdge = false,
} = {}) {
  if (!actorRoles.length || !targetRoles.length) {
    return { ok: false, message: MSG_NOT_ON_PROJECT };
  }
  if (actorCanAssign) {
    if (hasEdge) return { ok: true, reason: 'delegation_edge' };
    const n = Number(edgeCount) || 0;
    if (n === 0) return { ok: true, reason: 'same_project_no_delegation_graph' };
    return { ok: true, reason: 'same_project_can_assign' };
  }
  if (hasEdge) {
    return { ok: true, reason: 'delegation_edge' };
  }
  return { ok: false, message: MSG_NO_CAN_ASSIGN };
}

module.exports = {
  decideAssign,
  MSG_NOT_ON_PROJECT,
  MSG_NO_CAN_ASSIGN,
};
