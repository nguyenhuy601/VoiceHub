import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  COMPANY_SPACE_LEVEL,
  LAST_COMPANY_TEAM_ID_KEY,
  buildCompanyModuleSearch,
  isValidCompanyTeamId,
  listMyTeamsFromShell,
  normalizeCompanySpaceLevel,
  resolveCompanySpaceLevel,
  resolveMyDepartmentId,
} from './companySpaceLevel.js';

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
                  { _id: 'team3', name: 'Other', department: 'dept1' },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
};

describe('companySpaceLevel', () => {
  it('normalizes level', () => {
    assert.equal(normalizeCompanySpaceLevel('team'), COMPANY_SPACE_LEVEL.TEAM);
    assert.equal(normalizeCompanySpaceLevel(''), COMPANY_SPACE_LEVEL.DEPARTMENT);
  });

  it('resolves single department from shell', () => {
    assert.equal(resolveMyDepartmentId(shellFixture), 'dept1');
    assert.equal(
      resolveMyDepartmentId({
        access: { scope: { scopedDepartmentIds: ['d2'] } },
      }),
      'd2'
    );
    assert.equal(resolveMyDepartmentId({}), '');
  });

  it('lists only assigned teams', () => {
    const teams = listMyTeamsFromShell(shellFixture, 'dept1');
    assert.deepEqual(
      teams.map((t) => t.id).sort(),
      ['team1', 'team2']
    );
    assert.equal(teams.find((t) => t.id === 'team1')?.name, 'Alpha');
  });

  it('validates teamId', () => {
    assert.equal(isValidCompanyTeamId(shellFixture, 'team1', 'dept1'), true);
    assert.equal(isValidCompanyTeamId(shellFixture, 'team3', 'dept1'), false);
    assert.equal(isValidCompanyTeamId(shellFixture, '', 'dept1'), false);
  });

  it('resolves team level only for valid teamId', () => {
    const team = resolveCompanySpaceLevel({
      shell: shellFixture,
      departmentId: 'dept1',
      teamIdFromUrl: 'team2',
    });
    assert.equal(team.level, COMPANY_SPACE_LEVEL.TEAM);
    assert.equal(team.teamId, 'team2');

    const invalid = resolveCompanySpaceLevel({
      shell: shellFixture,
      departmentId: 'dept1',
      teamIdFromUrl: 'team3',
    });
    assert.equal(invalid.level, COMPANY_SPACE_LEVEL.DEPARTMENT);
    assert.equal(invalid.teamId, '');
  });

  it('preferTeam uses storage when URL empty', () => {
    const resolved = resolveCompanySpaceLevel({
      shell: shellFixture,
      departmentId: 'dept1',
      teamIdFromStorage: 'team1',
      preferTeam: true,
    });
    assert.equal(resolved.level, COMPANY_SPACE_LEVEL.TEAM);
    assert.equal(resolved.teamId, 'team1');
  });

  it('builds module search params', () => {
    const deptSpace = {
      organizationId: 'o1',
      departmentId: 'dept1',
      teamId: '',
      level: 'department',
    };
    const chatDept = buildCompanyModuleSearch(deptSpace, 'chat');
    assert.equal(chatDept.get('tab'), 'announcement');
    assert.equal(chatDept.get('teamId'), null);

    const teamSpace = {
      organizationId: 'o1',
      departmentId: 'dept1',
      teamId: 'team1',
      level: 'team',
    };
    const chatTeam = buildCompanyModuleSearch(teamSpace, 'chat');
    assert.equal(chatTeam.get('tab'), 'chat');
    assert.equal(chatTeam.get('teamId'), 'team1');

    const calTeam = buildCompanyModuleSearch(teamSpace, 'calendar');
    assert.equal(calTeam.get('tab'), 'calendar');
    assert.equal(calTeam.get('teamId'), 'team1');
    assert.equal(calTeam.get('departmentId'), 'dept1');
  });

  it('exports storage key', () => {
    assert.equal(LAST_COMPANY_TEAM_ID_KEY, 'voicehub:last-company-team-id');
  });
});
