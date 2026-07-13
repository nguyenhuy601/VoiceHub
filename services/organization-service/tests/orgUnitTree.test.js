/**
 * Huy: Unit tests — orgUnitTree validation + template catalog.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  listOrgStructureTemplates,
  getOrgStructureTemplate,
  cloneLevels,
} = require('../src/config/orgStructureTemplates');
const { nestUnits, projectOuTreeToLegacyBranches } = require('../src/services/orgUnitTree.service');

describe('orgStructureTemplates', () => {
  it('lists IT templates including enterprise-compat', () => {
    const list = listOrgStructureTemplates();
    const ids = list.map((t) => t.id);
    assert.ok(ids.includes('startup'));
    assert.ok(ids.includes('enterprise-software'));
    assert.ok(ids.includes('enterprise-compat'));
  });

  it('cloneLevels preserves order and keys', () => {
    const tpl = getOrgStructureTemplate('startup');
    const levels = cloneLevels(tpl.levels);
    assert.equal(levels.length, 1);
    assert.equal(levels[0].key, 'team');
  });
});

describe('orgUnitTree nest + project', () => {
  it('nests flat units by parentUnitId', () => {
    const a = { _id: '1', parentUnitId: null, name: 'A', levelKey: 'division' };
    const b = { _id: '2', parentUnitId: '1', name: 'B', levelKey: 'team' };
    const tree = nestUnits([a, b]);
    assert.equal(tree.length, 1);
    assert.equal(tree[0].children.length, 1);
    assert.equal(tree[0].children[0].name, 'B');
  });

  it('projects branch OU tree to legacy branches shape', () => {
    const tree = [
      {
        _id: 'b1',
        name: 'HQ',
        levelKey: 'branch',
        attributes: { isActive: true, location: 'HN' },
        children: [
          {
            _id: 'd1',
            name: 'Eng',
            levelKey: 'division',
            attributes: {},
            children: [
              {
                _id: 'dep1',
                name: 'BE',
                levelKey: 'department',
                attributes: {},
                children: [{ _id: 't1', name: 'API', levelKey: 'team', attributes: {}, children: [] }],
              },
            ],
          },
        ],
      },
    ];
    const branches = projectOuTreeToLegacyBranches(tree);
    assert.equal(branches.length, 1);
    assert.equal(branches[0].name, 'HQ');
    assert.equal(branches[0].divisions[0].departments[0].teams[0].name, 'API');
  });
});
