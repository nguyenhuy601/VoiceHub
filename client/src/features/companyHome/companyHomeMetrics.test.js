import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCompanyHomeViewModel,
  countScopedHomeDocuments,
  resolveCompanyHomeMetricNav,
} from './companyHomeMetrics.js';
import { COMPANY_SPACE_LEVEL } from '../../utils/companySpaceLevel.js';

const shellFixture = {
  access: {
    scope: {
      departmentId: 'dept1',
      teamId: 'team1',
      scopedDepartmentIds: ['dept1'],
      scopedTeamIds: ['team1', 'team2'],
    },
  },
  structureSummary: {
    branches: [
      {
        divisions: [
          {
            departments: [
              {
                _id: 'dept1',
                name: 'Engineering',
                teams: [
                  { _id: 'team1', name: 'Alpha', department: 'dept1' },
                  { _id: 'team2', name: 'Beta', department: 'dept1' },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
};

const labels = {
  homeFallback: 'Department home',
  teamFallback: 'Team',
  deptSub: 'Dept workspace',
  teamSub: (dept) => `Team · ${dept}`,
  pulseTeams: 'Teams',
  pulseDocs: 'Docs',
  distTeams: 'Teams',
  distDocs: 'Docs',
};

describe('countScopedHomeDocuments', () => {
  it('returns null when files not an array', () => {
    assert.equal(countScopedHomeDocuments(null, {}, () => []), null);
  });

  it('uses filterFn when provided', () => {
    const files = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const n = countScopedHomeDocuments(files, { departmentId: 'd1' }, (list) =>
      list.slice(0, 2)
    );
    assert.equal(n, 2);
  });
});

describe('buildCompanyHomeViewModel', () => {
  it('builds department overview from shell', () => {
    const vm = buildCompanyHomeViewModel({
      shell: shellFixture,
      departmentId: 'dept1',
      teamId: '',
      level: COMPANY_SPACE_LEVEL.DEPARTMENT,
      documentCount: 5,
      labels,
    });
    assert.equal(vm.isTeam, false);
    assert.equal(vm.title, 'Engineering');
    assert.equal(vm.subtitle, 'Dept workspace');
    assert.equal(vm.teamCount, 2);
    assert.equal(vm.documentDisplay, '5');
    assert.equal(vm.docsKnown, true);
    assert.equal(vm.pulse.length, 2);
    assert.equal(vm.distribution[0].value, 2);
  });

  it('builds team overview when level=team', () => {
    const vm = buildCompanyHomeViewModel({
      shell: shellFixture,
      departmentId: 'dept1',
      teamId: 'team1',
      level: COMPANY_SPACE_LEVEL.TEAM,
      documentCount: null,
      labels,
    });
    assert.equal(vm.isTeam, true);
    assert.equal(vm.title, 'Alpha');
    assert.equal(vm.subtitle, 'Team · Engineering');
    assert.equal(vm.teamId, 'team1');
    assert.equal(vm.documentDisplay, '—');
    assert.equal(vm.docsKnown, false);
  });

  it('falls back when department missing from structure', () => {
    const vm = buildCompanyHomeViewModel({
      shell: null,
      departmentId: 'orphan',
      labels,
    });
    assert.equal(vm.title, 'orphan');
    assert.equal(vm.teamCount, 0);
  });
});

describe('resolveCompanyHomeMetricNav', () => {
  it('maps known keys', () => {
    assert.equal(resolveCompanyHomeMetricNav('chat'), 'chat');
    assert.equal(resolveCompanyHomeMetricNav('documents'), 'documents');
    assert.equal(resolveCompanyHomeMetricNav('teams'), 'teams');
  });

  it('returns null for unknown / hidden modules', () => {
    assert.equal(resolveCompanyHomeMetricNav('calendar'), null);
    assert.equal(resolveCompanyHomeMetricNav('x'), null);
    assert.equal(resolveCompanyHomeMetricNav(''), null);
  });
});
