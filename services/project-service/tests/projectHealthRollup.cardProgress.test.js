const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  cardProgressGroup,
  mapCardProgressRow,
} = require('../src/services/projectHealthRollup.service');
const { classifyProjectHealth } = require('../src/utils/governance/directorHealth');

describe('cardProgressGroup (slim list aggregate)', () => {
  it('only exposes card health / percent fields', () => {
    const now = new Date('2026-10-01T00:00:00.000Z');
    const group = cardProgressGroup(now);
    const keys = Object.keys(group).sort();
    assert.deepEqual(keys, [
      '_id',
      'cancelledCards',
      'doneCards',
      'openCards',
      'overdueCards',
      'totalCards',
    ]);
    assert.equal('estimateHoursDone' in group, false);
    assert.equal('cycleTimeHoursSum' in group, false);
    assert.equal('sprintCommittedCards' in group, false);
  });

  it('mapCardProgressRow feeds classifyProjectHealth', () => {
    const asOf = new Date('2026-10-01T00:00:00.000Z');
    const progress = mapCardProgressRow({
      totalCards: 4,
      doneCards: 2,
      openCards: 2,
      cancelledCards: 0,
      overdueCards: 1,
    });
    assert.equal(progress.percentDoneCards, 0.5);
    assert.equal(progress.overdueCards, 1);
    const health = classifyProjectHealth(
      {
        status: 'in_development',
        isActive: true,
        expectedEndDate: '2026-12-01T00:00:00.000Z',
      },
      asOf,
      progress
    );
    assert.equal(health, 'at_risk');
  });
});
