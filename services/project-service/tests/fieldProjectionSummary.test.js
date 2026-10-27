const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { projectEmployee } = require('../src/utils/aiAnalysis/pipeline/fieldProjection');

describe('fieldProjection projectEmployee summary', () => {
  it('projects reEstimateCount alongside reopen and submittedEarlyHours', () => {
    const row = projectEmployee({
      userId: 'u1',
      capability: {
        projectExperiences: [
          {
            name: 'Board A',
            role: 'dev',
            technologies: ['Node.js'],
            summary: {
              reopenCount: 2,
              submittedEarlyHours: 4.5,
              reEstimateCount: 3,
            },
          },
        ],
      },
    });
    assert.ok(row);
    assert.ok(Array.isArray(row.history));
    assert.equal(row.history[0].summary.reopenCount, 2);
    assert.equal(row.history[0].summary.submittedEarlyHours, 4.5);
    assert.equal(row.history[0].summary.reEstimateCount, 3);
    assert.ok(row.history[0].technologies.includes('Node.js'));
  });
});
