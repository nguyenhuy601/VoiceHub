const Channel = require('../models/Channel');
const { invalidateOrgReadCache } = require('../services/orgReadCache.service');
const { ORG_EVENT_TYPES } = require('../messaging/orgEvents.publisher');
const { findActiveTeamNameConflict } = require('../utils/orgUnitNameConflict');
const { orgConflict, orgFail } = require('../utils/orgApiError');
const { toPlainId, assertActiveOrgMembers } = require('../utils/orgMemberIds');
const { assertTextLimits } = require('../utils/orgTextLimits');

async function readLeader(req) {
  if (req.body?.leader === undefined) return undefined;
  const leader = toPlainId(req.body.leader);
  if (leader) await assertActiveOrgMembers(req.params.orgId, [leader]);
  return leader;
}

const bumpOrgReadCache = (orgId) =>
  invalidateOrgReadCache(orgId, { eventType: ORG_EVENT_TYPES.CHANNEL_PROVISIONED }).catch(
    () => null
  );
const Team = require('../models/Team');

const buildScope = (req) => ({
  organization: req.params.orgId,
  department: req.params.deptId,
  isActive: true,
});

exports.getTeams = async (req, res, next) => {
  try {
    const teams = await Team.find({
      organization: req.params.orgId,
      department: req.params.deptId,
      isActive: true,
    });
    res.json({ status: 'success', data: teams });
  } catch (error) {
    next(error);
  }
};

exports.createTeam = async (req, res, next) => {
  try {
    const { name, description } = req.body || {};
    assertTextLimits({ name, description });
    const leader = (await readLeader(req)) || null;
    const conflict = await findActiveTeamNameConflict({
      organizationId: req.params.orgId,
      departmentId: req.params.deptId,
      name,
    });
    if (conflict) {
      return orgConflict(res, 'Team cùng tên đã tồn tại trong phòng ban này', 'ORG_TEAM_NAME_EXISTS');
    }
    const team = await Team.create({
      name,
      description,
      organization: req.params.orgId,
      department: req.params.deptId,
      leader,
    });
    const channel = await Channel.create({
      name: 'general',
      description: 'Team text chat',
      type: 'chat',
      ...buildScope(req),
      team: team._id,
      leader,
    });

    await bumpOrgReadCache(req.params.orgId);
    res.status(201).json({ status: 'success', data: { team, defaultChannel: channel } });
  } catch (error) {
    next(error);
  }
};

exports.updateTeam = async (req, res, next) => {
  try {
    const { name, description } = req.body || {};
    assertTextLimits({ name, description });
    const leader = await readLeader(req);
    const team = await Team.findOneAndUpdate(
      { _id: req.params.id, organization: req.params.orgId, department: req.params.deptId, isActive: true },
      { name, description, leader },
      { new: true }
    );

    await bumpOrgReadCache(req.params.orgId);
    res.json({ status: 'success', data: team });
  } catch (error) {
    next(error);
  }
};

exports.deleteTeam = async (req, res, next) => {
  try {
    await Team.findOneAndUpdate(
      { _id: req.params.id, organization: req.params.orgId, department: req.params.deptId, isActive: true },
      { isActive: false },
      { new: true }
    );
    await Channel.updateMany(
      { organization: req.params.orgId, department: req.params.deptId, team: req.params.id, isActive: true },
      { isActive: false }
    );
    await bumpOrgReadCache(req.params.orgId);
    res.json({ status: 'success', message: 'Team deleted' });
  } catch (error) {
    next(error);
  }
};

exports.getChannels = async (req, res, next) => {
  try {
    const channels = await Channel.find(buildScope(req));
    res.json({ status: 'success', data: channels });
  } catch (error) {
    next(error);
  }
};

exports.createChannel = async (req, res, next) => {
  try {
    const { name, description, type } = req.body || {};
    assertTextLimits({ name, description });
    const leader = toPlainId(req.body?.leader);
    const team = toPlainId(req.body?.team);
    if (team) {
      const teamExists = await Team.exists({ _id: team, ...buildScope(req) });
      if (!teamExists) return orgFail(res, 404, 'Team not found', 'ORG_NOT_FOUND');
    }
    const channel = await Channel.create({
      name,
      description,
      type: type || 'chat',
      ...buildScope(req),
      team: team || null,
      leader,
    });
    await bumpOrgReadCache(req.params.orgId);
    res.status(201).json({ status: 'success', data: channel });
  } catch (error) {
    next(error);
  }
};

exports.updateChannel = async (req, res, next) => {
  try {
    const { name, description, type } = req.body || {};
    assertTextLimits({ name, description });
    const leader = req.body?.leader === undefined ? undefined : toPlainId(req.body.leader);
    const channel = await Channel.findOneAndUpdate(
      { _id: req.params.id, ...buildScope(req) },
      { name, description, leader, type },
      { new: true }
    );
    await bumpOrgReadCache(req.params.orgId);
    res.json({ status: 'success', data: channel });
  } catch (error) {
    next(error);
  }
};

exports.deleteChannel = async (req, res, next) => {
  try {
    await Channel.findOneAndUpdate(
      { _id: req.params.id, ...buildScope(req) },
      { isActive: false },
      { new: true }
    );
    await bumpOrgReadCache(req.params.orgId);
    res.json({ status: 'success', message: 'Channel deleted' });
  } catch (error) {
    next(error);
  }
};
