const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { cloneProjectExperiences } = require('../src/services/capabilityProfile.service');

describe('capabilityProfile taskHighlights (Wave B / E5)', () => {
  it('omits taskHighlights when absent on legacy experience', () => {
    const [row] = cloneProjectExperiences([
      { name: 'Legacy', role: 'dev', work: 'contrib', source: 'closed_board', status: 'verified' },
    ]);
    assert.ok(row);
    assert.equal(row.taskHighlights, undefined);
  });

  it('clones and caps taskHighlights at 5', () => {
    const highlights = Array.from({ length: 8 }, (_, i) => ({
      taskId: `t${i}`,
      title: `Task ${i}`,
      tags: [`Tag${i}`],
      submittedEarlyHours: i,
      reopenCount: 0,
    }));
    const [row] = cloneProjectExperiences([
      {
        name: 'Board',
        role: 'dev',
        work: 'ship',
        source: 'closed_board',
        status: 'verified',
        taskHighlights: highlights,
      },
    ]);
    assert.ok(row.taskHighlights);
    assert.equal(row.taskHighlights.length, 5);
    assert.equal(row.taskHighlights[0].taskId, 't0');
    assert.ok(row.taskHighlights[0].tags.includes('Tag0'));
  });
});
