const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { architecture } = require('../src/tools/architecture');

describe('ArchitectureTool', () => {
  it('returns stub:false and components array (length >= 0)', async () => {
    const out = await architecture(
      {
        snapshotId: 'snap-arch',
        functionalRequirements: [
          {
            externalId: 'FR-1',
            name: 'API Gateway',
            description: 'Expose REST API',
            module: 'Platform',
          },
        ],
      },
      {
        container: {
          analyses: {
            capability: {
              items: [
                {
                  capabilityId: 'CAP-1',
                  name: 'Auth API',
                  module: 'Auth',
                  complexity: 'high',
                  sourceFrIds: ['FR-1'],
                  requiredSkills: [{ name: 'Backend', level: 3 }],
                },
              ],
            },
            gap: { items: [] },
          },
        },
      }
    );
    assert.equal(out.result.stub, false);
    assert.ok(Array.isArray(out.result.components));
    assert.ok(out.result.components.length >= 0);
    assert.ok(out.result.components.length >= 1);
    assert.ok(Array.isArray(out.evidence));
  });

  it('still returns stub:false with empty catalog/gaps', async () => {
    const out = await architecture({ snapshotId: 'snap-empty' }, { container: {} });
    assert.equal(out.result.stub, false);
    assert.ok(Array.isArray(out.result.components));
    assert.ok(out.result.components.length >= 0);
  });
});
