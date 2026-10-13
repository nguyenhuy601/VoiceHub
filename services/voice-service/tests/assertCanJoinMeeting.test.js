const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const orgAccessPath = path.resolve(__dirname, '../src/utils/orgVoiceChannelAccess.js');
const policyPath = path.resolve(__dirname, '../src/utils/meetingJoinPolicy.js');
const accessPolicyPath = path.resolve(__dirname, '../src/utils/meetingAccessPolicy.js');

describe('assertCanJoinMeeting', () => {
  let assertCanJoinMeeting;
  let orgAccessCalls;

  beforeEach(() => {
    orgAccessCalls = [];
    for (const p of [orgAccessPath, policyPath]) delete require.cache[p];

    require.cache[orgAccessPath] = {
      id: orgAccessPath,
      filename: orgAccessPath,
      loaded: true,
      exports: {
        assertOrgVoiceChannelAccess: async (args) => {
          orgAccessCalls.push(args);
          if (args.organizationId === 'org-deny') return { allowed: false };
          if (args.organizationId === 'org-ok') return { allowed: true };
          return { allowed: false };
        },
      },
    };

    ({ assertCanJoinMeeting } = require(policyPath));
  });

  afterEach(() => {
    for (const p of [orgAccessPath, policyPath, accessPolicyPath]) delete require.cache[p];
  });

  it('allows host', async () => {
    await assertCanJoinMeeting({ hostId: 'u-host', participants: [], organizationId: null }, 'u-host');
    assert.equal(orgAccessCalls.length, 0);
  });

  it('allows former participant (rejoin)', async () => {
    await assertCanJoinMeeting(
      {
        hostId: 'u-host',
        participants: [{ userId: 'u-old', leftAt: new Date() }],
        organizationId: null,
      },
      'u-old'
    );
    assert.equal(orgAccessCalls.length, 0);
  });

  it('allows org channel member', async () => {
    await assertCanJoinMeeting(
      {
        _id: 'm1',
        hostId: 'u-host',
        participants: [],
        organizationId: 'org-ok',
        voiceChannelId: 'ch1',
      },
      'u-member'
    );
    assert.equal(orgAccessCalls.length, 1);
    assert.equal(orgAccessCalls[0].channelId, 'ch1');
  });

  it('denies outsider without org access', async () => {
    await assert.rejects(
      () =>
        assertCanJoinMeeting(
          {
            _id: 'm1',
            hostId: 'u-host',
            participants: [],
            organizationId: 'org-deny',
            voiceChannelId: 'ch1',
          },
          'u-outsider'
        ),
      (err) => err.statusCode === 403
    );
  });

  it('denies outsider when meeting has no organizationId', async () => {
    await assert.rejects(
      () =>
        assertCanJoinMeeting(
          { hostId: 'u-host', participants: [], organizationId: null },
          'u-outsider'
        ),
      (err) => err.statusCode === 403
    );
  });
});
