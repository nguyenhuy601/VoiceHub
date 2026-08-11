const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildPlacementMaps,
  placementFromMaps,
  emptyPlacement,
  mergeStructureMembersIntoVisibility,
} = require('../src/services/structurePlacement.service');

describe('structurePlacement', () => {
  it('T1: user only in Department.members → primary department', () => {
    const departments = [
      { _id: 'depA', name: 'Backend', members: ['u1', 'u2'], division: 'div1' },
      { _id: 'depB', name: 'Frontend', members: ['u3'], division: 'div1' },
    ];
    const maps = buildPlacementMaps(departments, []);
    const place = placementFromMaps(maps.deptByUser, maps.teamByUser, 'u1');
    assert.equal(place.primaryDepartmentId, 'depA');
    assert.equal(place.departmentName, 'Backend');
    assert.deepEqual(place.departmentIds, ['depA']);
    assert.deepEqual(place.divisionIds, ['div1']);
    assert.equal(place.primaryTeamId, null);
  });

  it('department head is placed even when not in members[]', () => {
    const departments = [
      { _id: 'depA', name: 'Backend', members: ['u2'], head: 'u1', division: 'div1' },
    ];
    const maps = buildPlacementMaps(departments, []);
    const place = placementFromMaps(maps.deptByUser, maps.teamByUser, 'u1');
    assert.equal(place.primaryDepartmentId, 'depA');
  });

  it('team members inherit department when not in department.members', () => {
    const departments = [{ _id: 'depA', name: 'Backend', members: [], division: 'div1' }];
    const teams = [{ _id: 'team1', name: 'API', department: 'depA', members: ['u9'] }];
    const maps = buildPlacementMaps(departments, teams);
    const place = placementFromMaps(maps.deptByUser, maps.teamByUser, 'u9');
    assert.equal(place.primaryTeamId, 'team1');
    assert.equal(place.primaryDepartmentId, 'depA');
    assert.equal(place.departmentName, 'Backend');
  });

  it('empty for unknown user', () => {
    const maps = buildPlacementMaps([{ _id: 'depA', name: 'Backend', members: ['u1'] }], []);
    const place = placementFromMaps(maps.deptByUser, maps.teamByUser, 'nobody');
    assert.deepEqual(place, emptyPlacement());
  });

  it('first department wins when user listed twice (should not happen)', () => {
    const departments = [
      { _id: 'depA', name: 'A', members: ['u1'] },
      { _id: 'depB', name: 'B', members: ['u1'] },
    ];
    const maps = buildPlacementMaps(departments, []);
    const place = placementFromMaps(maps.deptByUser, maps.teamByUser, 'u1');
    assert.equal(place.primaryDepartmentId, 'depA');
  });

  it('T2: merge members placement into empty structureVisibility → mode structure_members', () => {
    const visibility = {
      mode: 'none',
      divisionIds: new Set(),
      departmentIds: new Set(),
      teamIds: new Set(),
    };
    const place = {
      ...emptyPlacement(),
      departmentIds: ['depA'],
      divisionIds: ['div1'],
      primaryDepartmentId: 'depA',
      departmentName: 'Backend',
    };
    const { merged } = mergeStructureMembersIntoVisibility(visibility, place);
    assert.equal(merged, true);
    assert.equal(visibility.mode, 'structure_members');
    assert.equal(visibility.departmentIds.has('depA'), true);
    assert.equal(visibility.divisionIds.has('div1'), true);
  });
});
