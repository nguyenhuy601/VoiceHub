/* eslint-disable no-console */
/**
 * Smoke: department-scoped chat/voice channels.
 *
 *   node tests/department-channels.smoke.js
 */
process.env.ROLE_PERMISSION_SERVICE_URL =
  process.env.ROLE_PERMISSION_SERVICE_URL || 'http://localhost:3099';

const assert = require('assert');

function aclVisibilitySmoke() {
  const {
    channelInStructureVisibility,
    buildTeamDepartmentMap,
    userHasTeamInDepartment,
    isDeptOnlyChannel,
  } = require('../services/organization-service/src/utils/memberPlacementScope');

  const teams = [
    { _id: 'team1', department: 'dept1' },
    { _id: 'team2', department: 'dept2' },
  ];
  const teamDeptMap = buildTeamDepartmentMap(teams);
  const visibility = {
    mode: 'multi',
    divisionIds: new Set(),
    departmentIds: new Set(),
    teamIds: new Set(['team1']),
  };

  const deptChannel = { department: 'dept1', team: null };
  assert.strictEqual(
    channelInStructureVisibility(deptChannel, visibility, teamDeptMap),
    true,
    'team member should see parent department channel'
  );
  assert.strictEqual(
    channelInStructureVisibility({ department: 'dept2', team: null }, visibility, teamDeptMap),
    false
  );
  assert.strictEqual(userHasTeamInDepartment(visibility.teamIds, 'dept1', teamDeptMap), true);
  assert.strictEqual(isDeptOnlyChannel({ department: 'dept1', team: null }), true);
  assert.strictEqual(isDeptOnlyChannel({ department: 'dept1', team: 'team1' }), false);
}

function provisionSeedSmoke() {
  const { buildDeptChannelSeed, DEFAULT_DEPT_CHANNEL_DEFS } = require('../services/organization-service/src/services/departmentChannelProvision.service');

  assert.strictEqual(DEFAULT_DEPT_CHANNEL_DEFS.length, 2);
  const chatSeed = buildDeptChannelSeed(
    {
      organizationId: 'org1',
      branchId: 'b1',
      divisionId: 'div1',
      departmentId: 'dept1',
      leaderId: 'u1',
    },
    DEFAULT_DEPT_CHANNEL_DEFS[0]
  );
  assert.strictEqual(chatSeed.team, null);
  assert.strictEqual(String(chatSeed.department), 'dept1');
  assert.strictEqual(chatSeed.type, 'chat');
  assert.strictEqual(chatSeed.name, 'general');
}

function clientUtilsSmoke() {
  const channelsForDepartment = (channels, departmentId) =>
    (channels || []).filter(
      (ch) =>
        String(ch.department || '') === String(departmentId) && !String(ch.team || '')
    );

  const resolveDeptChatChannelId = (channels, departmentId) => {
    const chat = channelsForDepartment(channels, departmentId).filter(
      (ch) => String(ch.type || 'chat').toLowerCase() !== 'voice'
    );
    const general = chat.find((ch) => String(ch.name || '').toLowerCase() === 'general');
    return general?._id ? String(general._id) : chat[0]?._id ? String(chat[0]._id) : '';
  };

  const resolveDeptVoiceChannelId = (channels, departmentId) => {
    const voice = channelsForDepartment(channels, departmentId).filter(
      (ch) => String(ch.type || '').toLowerCase() === 'voice'
    );
    const named = voice.find((ch) => String(ch.name || '').toLowerCase() === 'voice');
    return named?._id ? String(named._id) : voice[0]?._id ? String(voice[0]._id) : '';
  };

  const channels = [
    { _id: 'c-dept-chat', name: 'general', type: 'chat', department: 'dept1', team: null },
    { _id: 'c-dept-voice', name: 'voice', type: 'voice', department: 'dept1', team: null },
    { _id: 'c-team-chat', name: 'general', type: 'chat', department: 'dept1', team: 'team1' },
  ];

  assert.strictEqual(channelsForDepartment(channels, 'dept1').length, 2);
  assert.strictEqual(resolveDeptChatChannelId(channels, 'dept1'), 'c-dept-chat');
  assert.strictEqual(resolveDeptVoiceChannelId(channels, 'dept1'), 'c-dept-voice');

  const preferDeptOnly = (channelList, departmentId) => {
    const pool = channelList || [];
    const deptChannels = pool.filter(
      (ch) =>
        String(ch.department || '') === String(departmentId) && !String(ch.team || '')
    );
    const chat = deptChannels.filter(
      (ch) => String(ch.type || 'chat').toLowerCase() !== 'voice'
    );
    const general = chat.find((ch) => String(ch.name || '').toLowerCase() === 'general');
    return general?._id ? String(general._id) : chat[0]?._id ? String(chat[0]._id) : '';
  };

  const teamGeneral = { _id: 'c-team', name: 'general', type: 'chat', department: 'dept1', team: 'team1' };
  const mixed = [...channels, teamGeneral];
  assert.strictEqual(
    preferDeptOnly(mixed, 'dept1'),
    'c-dept-chat',
    'deptOnly must not fall back to team general'
  );
}

function orgChannelScopeSmoke() {
  const {
    resolveScopedWorkspaceChannels,
    channelsForDepartment,
    isProtectedDefaultChannel,
  } = require('../client/src/utils/orgChannelScope.js');

  assert.strictEqual(isProtectedDefaultChannel({ name: 'general', type: 'chat' }), true);
  assert.strictEqual(isProtectedDefaultChannel({ name: 'voice', type: 'voice' }), true);
  assert.strictEqual(isProtectedDefaultChannel({ name: 'random', type: 'chat' }), false);

  const channels = [
    { _id: 'c-dept-chat', name: 'general', type: 'chat', department: 'dept1', team: null },
    { _id: 'c-dept-voice', name: 'voice', type: 'voice', department: 'dept1', team: null },
    { _id: 'c-team-chat', name: 'general', type: 'chat', department: 'dept1', team: 'team1' },
    { _id: 'c-team-voice', name: 'voice', type: 'voice', department: 'dept1', team: 'team1' },
  ];

  assert.strictEqual(channelsForDepartment(channels, 'dept1').length, 2);
  const deptOnly = resolveScopedWorkspaceChannels(channels, {
    departmentId: 'dept1',
    departmentOnly: true,
  });
  assert.strictEqual(deptOnly.length, 2);
  assert.ok(deptOnly.every((ch) => !ch.team));

  const teamScope = resolveScopedWorkspaceChannels(channels, {
    teamId: 'team1',
    departmentId: 'dept1',
    departmentOnly: false,
  });
  assert.strictEqual(teamScope.length, 4, 'team workspace includes dept parent + team channels');
}

function hubCardSmoke() {
  const { channelUnreadCount } = require('../client/src/components/Organization/organizationStructureTheme.js');

  const deptOnly = [
    { _id: 'c1', type: 'chat', department: 'dept1', team: null, unread: 2 },
  ];
  const teamScoped = [
    { _id: 'c2', type: 'chat', department: 'dept1', team: 'team1', unread: 3 },
  ];
  const deptUnread = deptOnly.reduce((sum, ch) => sum + channelUnreadCount(ch), 0);
  const teamUnread = teamScoped.reduce((sum, ch) => sum + channelUnreadCount(ch), 0);
  assert.strictEqual(deptUnread, 2);
  assert.strictEqual(teamUnread, 3);
  assert.strictEqual(deptUnread + teamUnread, 5);
}

async function run() {
  aclVisibilitySmoke();
  provisionSeedSmoke();
  clientUtilsSmoke();
  orgChannelScopeSmoke();
  hubCardSmoke();
  console.log('department-channels.smoke.js: OK');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
