import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { filterAdminProjects } from './filterAdminProjects.js';

describe('filterAdminProjects', () => {
  const list = [
    { _id: '1', title: 'Alpha CRM', projectCode: 'CRM-01', status: 'draft', isActive: true },
    {
      _id: '2',
      title: 'Beta Portal',
      projectCode: 'PORT-02',
      status: 'in_development',
      isActive: true,
    },
    { _id: '3', title: 'Gamma', projectCode: 'G-03', status: 'closed', isActive: false },
  ];

  it('filters by status exact match', () => {
    const rows = filterAdminProjects(list, { status: 'in_development' });
    assert.equal(rows.length, 1);
    assert.equal(rows[0]._id, '2');
  });

  it('filters by search title/code', () => {
    const rows = filterAdminProjects(list, { q: 'crm' });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].projectCode, 'CRM-01');
  });

  it('excludes inactive projects', () => {
    const rows = filterAdminProjects(list, {});
    assert.equal(rows.length, 2);
    assert.ok(!rows.some((p) => p._id === '3'));
  });

  it('combines query and status', () => {
    const rows = filterAdminProjects(list, { q: 'beta', status: 'draft' });
    assert.equal(rows.length, 0);
  });
});
