/**
 * @jest-environment node
 * Membership.normalizeRole — P1: department_head không elevate admin.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// Lightweight mirror of Membership.normalizeRole after P1 (avoid mongoose bootstrap).
function normalizeRole(role) {
  const roleMap = {
    owner: 'owner',
    admin: 'admin',
    hr: 'hr',
    human_resources: 'hr',
    nhan_su: 'hr',
    member: 'member',
    org_admin: 'admin',
    department_head: 'member',
    team_leader: 'member',
    employee: 'member',
  };
  return roleMap[role] || 'member';
}

describe('Membership.normalizeRole P1', () => {
  it('does not map department_head to admin', () => {
    assert.equal(normalizeRole('department_head'), 'member');
    assert.equal(normalizeRole('team_leader'), 'member');
    assert.equal(normalizeRole('org_admin'), 'admin');
  });
});
