const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  attachG1Catalogs,
  collectRunScopedSkillNames,
} = require('../src/knowledge/attachG1Catalogs');
const {
  G1_CONTRACT_VERSION,
  resolveMetric,
} = require('../src/knowledge/g1CatalogSchemas');

describe('attachG1Catalogs', () => {
  it('promotes run-scoped skills and pins platform metric/dimension seed', () => {
    const out = attachG1Catalogs({
      projected: {
        skillCatalog: { version: 'cap-whitelist-v2', skills: ['React', 'Node.js'] },
        employees: [
          {
            employeeId: 'e1',
            skills: [{ name: 'React', level: 3 }, { name: 'ObscureLegacy', level: 1 }],
          },
        ],
      },
    });

    assert.equal(out.attached, true);
    assert.equal(out.skipped, false);
    assert.equal(out.g1Catalogs.contractVersion, G1_CONTRACT_VERSION);
    assert.ok(out.g1Catalogs.metricCatalog.some((m) => m.metricId === 'available_capacity'));
    assert.ok(out.g1Catalogs.dimensionCatalog.some((d) => d.dimensionId === 'skill_level'));

    const skills = out.snapshot.projected.skillCatalog.skills;
    assert.ok(skills.some((s) => s.skillId === 'skill:react' && s.name === 'React'));
    assert.ok(skills.some((s) => s.name === 'Node.js'));

    assert.ok(
      out.g1Warnings.some(
        (w) => w.code === 'G1_CATALOG_MISS' && w.kind === 'skill' && /ObscureLegacy/i.test(w.id)
      )
    );
    assert.ok(resolveMetric('available_capacity'));
  });

  it('does not merge skills from another project shape — only this payload', () => {
    const names = collectRunScopedSkillNames({
      projected: {
        skillCatalog: { version: 'v1', skills: ['Kotlin'] },
      },
      // stray field must not invent cross-run merge; only collectRunScoped paths
      otherProjectSkills: ['ShouldNotAppear'],
    });
    assert.deepEqual(names, ['Kotlin']);
  });

  it('is idempotent when contractVersion already pinned', () => {
    const first = attachG1Catalogs({
      projected: { skillCatalog: { version: 'v1', skills: ['Go'] } },
    });
    const second = attachG1Catalogs(first.snapshot);
    assert.equal(second.skipped, true);
    assert.equal(second.g1Catalogs.contractVersion, G1_CONTRACT_VERSION);
    assert.ok(second.snapshot.projected.skillCatalog.skills.some((s) => s.name === 'Go'));
  });

  it('handles null snapshot — still pins platform catalogs', () => {
    const out = attachG1Catalogs(null);
    assert.equal(out.g1Catalogs.contractVersion, G1_CONTRACT_VERSION);
    assert.equal(out.snapshot.projected.skillCatalog.skills.length, 0);
  });

  it('builds skills from staffing when skillCatalog empty', () => {
    const out = attachG1Catalogs({
      staffingPlan: { requiredSkills: [{ name: 'PostgreSQL' }] },
      projected: { skillCatalog: { version: 'v1', skills: [] }, employees: [] },
    });
    assert.ok(
      out.snapshot.projected.skillCatalog.skills.some((s) => s.name === 'PostgreSQL')
    );
  });
});
