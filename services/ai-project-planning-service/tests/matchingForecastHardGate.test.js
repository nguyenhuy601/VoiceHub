const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { runEmployeeMatching } = require('../src/engines/employeeMatching');

describe('matching forecast hard-gate', () => {
  it('marks candidate infeasible when forecast + effort exceeds 100%', async () => {
    const container = {
      planning: {
        tasks: [
          {
            id: 'T1',
            level: 'task',
            name: 'API',
            effortHours: 16,
            suggestedRoleKey: 'backend_developer',
          },
        ],
        effort: { byRole: { backend_developer: 16 } },
        roles: [{ roleKey: 'backend_developer' }],
      },
    };
    const result = await runEmployeeMatching(null, container, {
      poolItems: [
        {
          userId: '507f1f77bcf86cd799439011',
          displayName: 'Busy Dev',
          capacityRemaining: 0.2,
          availablePct: 20,
          forecastWorkloadPct: 80,
          forecastDemandHours: 32,
          skills: [],
          isActive: true,
        },
      ],
    });
    const cand = result.recommendations[0]?.candidates?.[0];
    assert.ok(cand);
    assert.equal(cand.feasible, false);
    assert.ok((cand.reasons || []).includes('forecast_overload'));
  });

  it('keeps feasible when forecast + effort stays at or under 100%', async () => {
    const container = {
      planning: {
        tasks: [
          {
            id: 'T1',
            level: 'task',
            name: 'API',
            effortHours: 4,
            suggestedRoleKey: 'backend_developer',
          },
        ],
        effort: { byRole: { backend_developer: 4 } },
        roles: [{ roleKey: 'backend_developer' }],
      },
    };
    const result = await runEmployeeMatching(null, container, {
      poolItems: [
        {
          userId: '507f1f77bcf86cd799439012',
          displayName: 'Free Dev',
          capacityRemaining: 0.5,
          availablePct: 50,
          forecastWorkloadPct: 50,
          forecastDemandHours: 20,
          skills: [],
          isActive: true,
        },
      ],
    });
    const cand = result.recommendations[0]?.candidates?.[0];
    assert.ok(cand);
    assert.equal(cand.feasible, true);
    assert.ok(!(cand.reasons || []).includes('forecast_overload'));
  });
});
