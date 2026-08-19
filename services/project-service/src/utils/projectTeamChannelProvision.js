const { logger } = require('@enterprise/shared');
const Project = require('../models/Project');
const { emitProjectTeamChannelProvisionBestEffort } = require('../clients/projectChatPublisher.client');
const { normalizeOwnerTeamId } = require('../services/ownerTeamId');

/**
 * Lazy-provision project team channel khi ownerTeamId lần đầu xuất hiện trên project.
 */
async function emitTeamChannelProvisionIfNeeded({
  organizationId,
  projectId,
  teamId,
  actorUserId,
  projectTitle,
}) {
  const tid = normalizeOwnerTeamId(teamId);
  const pid = String(projectId || '').trim();
  const oid = String(organizationId || '').trim();
  if (!tid || !pid || !oid) return;

  let title = String(projectTitle || '').trim();
  if (!title) {
    try {
      const row = await Project.findById(pid).select('title').lean();
      title = String(row?.title || '').trim();
    } catch (err) {
      logger.warn('[projectChat] resolve project title failed: %s', err.message);
    }
  }

  emitProjectTeamChannelProvisionBestEffort({
    organizationId: oid,
    projectId: pid,
    teamId: tid,
    projectTitle: title,
    createdBy: actorUserId || null,
  });
}

module.exports = {
  emitTeamChannelProvisionIfNeeded,
};
