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

  it('projects taskHighlights onto history for matching', () => {
    const row = projectEmployee({
      userId: 'u2',
      capability: {
        projectExperiences: [
          {
            name: 'Board B',
            role: 'dev',
            taskHighlights: [
              {
                taskId: 't1',
                title: 'GraphQL gateway',
                tags: ['GraphQL', 'Node'],
                submittedEarlyHours: 3,
                reopenCount: 0,
              },
            ],
          },
        ],
      },
    });
    assert.ok(row?.history?.[0]?.taskHighlights?.length);
    assert.equal(row.history[0].taskHighlights[0].title, 'GraphQL gateway');
    assert.ok(row.history[0].taskHighlights[0].tags.includes('GraphQL'));
  });

  it('E6 compat: missing taskHighlights does not throw and omits field', () => {
    assert.doesNotThrow(() => {
      const row = projectEmployee({
        userId: 'u3',
        capability: {
          projectExperiences: [{ name: 'Legacy Board', role: 'dev', work: 'stuff' }],
        },
      });
      assert.ok(row?.history?.[0]);
      assert.equal(row.history[0].taskHighlights, undefined);
    });
  });
});
