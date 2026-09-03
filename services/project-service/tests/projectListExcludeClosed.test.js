const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

/**
 * Mirrors listProjects base filter for excludeClosed (no DB).
 */
function buildListFilter({ allowArchived = false, excludeClosed = false, organizationId = 'o1' }) {
  const base = { organizationId };
  if (!allowArchived) base.isActive = true;
  if (excludeClosed) base.status = { $nin: ['closed'] };
  return base;
}

describe('listProjects excludeClosed filter', () => {
  it('adds status $nin closed when excludeClosed', () => {
    assert.deepEqual(buildListFilter({ excludeClosed: true }), {
      organizationId: 'o1',
      isActive: true,
      status: { $nin: ['closed'] },
    });
  });

  it('omits status filter when excludeClosed false', () => {
    assert.deepEqual(buildListFilter({ excludeClosed: false }), {
      organizationId: 'o1',
      isActive: true,
    });
  });
});
