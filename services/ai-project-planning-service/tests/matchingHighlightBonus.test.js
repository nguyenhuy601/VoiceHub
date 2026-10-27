const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { historyOverlapBonus } = require('../src/engines/employeeMatching');

describe('matching taskHighlights bonus (Wave C)', () => {
  it('increases bonus when highlight tags ∩ needSkills', () => {
    const without = historyOverlapBonus(
      {
        history: [{ role: 'developer', projectName: 'Old', work: 'contrib' }],
      },
      { suggestedRoleKey: 'developer' },
      new Set(['graphql'])
    );
    const withHighlights = historyOverlapBonus(
      {
        history: [
          {
            role: 'developer',
            projectName: 'Old',
            work: 'contrib',
            taskHighlights: [{ title: 'API Gateway', tags: ['GraphQL', 'Node.js'] }],
          },
        ],
      },
      { suggestedRoleKey: 'developer' },
      new Set(['graphql'])
    );
    assert.ok(withHighlights > without);
    assert.ok(withHighlights <= 0.1);
  });

  it('E7 ceiling ≤0.1 when role+domain+highlight tags all hit', () => {
    const bonus = historyOverlapBonus(
      {
        primaryDomain: 'graphql',
        history: [
          {
            role: 'developer',
            domain: 'graphql',
            projectName: 'Old',
            work: 'contrib',
            technologies: ['GraphQL'],
            taskHighlights: [
              { title: 'GraphQL federation', tags: ['GraphQL', 'Apollo'] },
              { title: 'Schema stitching', tags: ['graphql'] },
            ],
          },
        ],
      },
      { suggestedRoleKey: 'developer' },
      new Set(['graphql', 'apollo'])
    );
    assert.ok(bonus <= 0.1);
    assert.ok(bonus > 0);
  });
});
