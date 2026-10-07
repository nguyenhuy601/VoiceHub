const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  isValidEntityRef,
  filterApprovalsByAccess,
} = require('../src/utils/approval/approvalAccess');

describe('isValidEntityRef', () => {
  it('rejects unknown type and bad ids', () => {
    assert.equal(isValidEntityRef('nope', 'x'), false);
    assert.equal(isValidEntityRef('change_request', ''), false);
    assert.equal(isValidEntityRef('change_request', 'a'.repeat(129)), false);
    assert.equal(isValidEntityRef('change_request', 'bad id!'), false);
  });

  it('accepts known types', () => {
    assert.equal(isValidEntityRef('change_request', '0123456789abcdef01234567'), true);
    assert.equal(isValidEntityRef('merge_request', 'mr_1'), true);
  });
});

describe('filterApprovalsByAccess', () => {
  it('drops other-org rows and counts org checks once', async () => {
    let orgCalls = 0;
    const rows = [
      { organizationId: 'orgA', projectId: 'p1' },
      { organizationId: 'orgA', projectId: 'p2' },
      { organizationId: 'orgB', projectId: 'p3' },
    ];
    const out = await filterApprovalsByAccess(rows, {
      canAccessOrg: async (orgId) => {
        orgCalls += 1;
        return orgId === 'orgA';
      },
      canViewProject: async () => true,
    });
    assert.equal(out.length, 2);
    assert.equal(orgCalls, 2);
  });

  it('drops project without view permission', async () => {
    const rows = [
      { organizationId: 'orgA', projectId: 'p1' },
      { organizationId: 'orgA', projectId: 'p2' },
    ];
    const out = await filterApprovalsByAccess(rows, {
      canAccessOrg: async () => true,
      canViewProject: async (pid) => pid === 'p1',
    });
    assert.equal(out.length, 1);
    assert.equal(out[0].projectId, 'p1');
  });

  it('legacy row without org allowed when project viewable', async () => {
    const out = await filterApprovalsByAccess([{ projectId: 'p1' }], {
      canAccessOrg: async () => false,
      canViewProject: async () => true,
    });
    assert.equal(out.length, 1);
  });
});
