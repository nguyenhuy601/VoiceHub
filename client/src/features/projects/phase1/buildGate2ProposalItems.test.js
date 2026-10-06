import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildGate2ProposalItems } from './buildGate2ProposalItems.js';
import {
  areGate2SectionDecisionsComplete,
  countGate2PendingDecisions,
} from './gate2/gate2SectionTableConfig.js';

describe('buildGate2ProposalItems', () => {
  it('builds task and assignment sections from planning container', () => {
    const pack = {
      aiAnalysis: {
        phaseRuns: { phase_how: { status: 'ready' } },
        planning: {
          tasks: [
            {
              id: 'TASK-1',
              name: 'Build API',
              level: 'task',
              suggestedRoleKey: 'backend_developer',
              effortHours: 16,
            },
          ],
        },
        analyses: {
          dependency: { edges: [{ id: 'e1', from: 'TASK-1', to: 'TASK-2', type: 'FS' }] },
        },
        resource: {
          recommendations: [
            {
              taskId: 'TASK-1',
              shortlist: [{ userId: 'u1', displayName: 'Ann', score: 0.9 }],
            },
          ],
        },
      },
    };
    const bundle = buildGate2ProposalItems({ pack });
    assert.equal(bundle.readyForGate2, true);
    assert.ok(bundle.proposalBySection.tasks.length >= 1);
    assert.ok(bundle.proposalBySection.dependencies.length >= 1);
    assert.ok(bundle.proposalBySection.assignments.length >= 1);
    assert.equal(bundle.proposalSections.length, 5);
    assert.equal(
      bundle.proposalSections.some((s) => s.key === 'feasibility'),
      false
    );
  });

  it('consolidates assignments by branch when same assignee', () => {
    const pack = {
      aiAnalysis: {
        planning: {
          tasks: [
            { id: 'STORY-1', name: 'Login story', level: 'story', parentId: 'FEAT-1' },
            { id: 'T-1', name: 'Task 1', level: 'task', parentId: 'STORY-1' },
            { id: 'T-2', name: 'Task 2', level: 'task', parentId: 'STORY-1' },
          ],
        },
        resource: {
          assignments: [
            { taskId: 'T-1', userId: 'u1', displayName: 'An Nguyen' },
            { taskId: 'T-2', userId: 'u1', displayName: 'An Nguyen' },
          ],
          recommendations: [
            { taskId: 'T-1', shortlist: [{ userId: 'u1', displayName: 'An Nguyen', score: 0.8 }] },
            { taskId: 'T-2', shortlist: [{ userId: 'u1', displayName: 'An Nguyen', score: 0.7 }] },
          ],
        },
      },
    };
    const { proposalBySection } = buildGate2ProposalItems({ pack });
    assert.equal(proposalBySection.assignments.length, 1);
    assert.equal(proposalBySection.assignments[0].id, 'STORY-1');
    assert.equal(proposalBySection.assignments[0].assignee, 'An Nguyen');
  });

  it('schedule merges resource.schedule for all assigned leaves', () => {
    const pack = {
      aiAnalysis: {
        planning: {
          tasks: [
            { id: 'T-1', name: 'One', level: 'task', startDate: '2026-10-05', dueDate: '2026-10-05' },
            { id: 'T-2', name: 'Two', level: 'task' },
          ],
        },
        resource: {
          schedule: [
            { taskId: 'T-2', dateKey: '2026-10-06', hours: 4 },
            { taskId: 'T-2', dateKey: '2026-10-07', hours: 4 },
          ],
          recommendations: [
            { taskId: 'T-1', shortlist: [{ userId: 'u1' }] },
            { taskId: 'T-2', shortlist: [{ userId: 'u1' }] },
          ],
        },
      },
    };
    const { proposalBySection } = buildGate2ProposalItems({ pack });
    assert.equal(proposalBySection.schedule.length, 2);
    const t2 = proposalBySection.schedule.find((r) => r.id === 'T-2');
    assert.equal(t2.startDate, '2026-10-06');
    assert.equal(t2.dueDate, '2026-10-07');
  });

  it('requires decisions on all rows before complete', () => {
    const bySection = {
      tasks: [{ logicalId: 'task:1', id: '1' }],
      dependencies: [],
    };
    assert.equal(areGate2SectionDecisionsComplete(bySection, {}), false);
    assert.equal(countGate2PendingDecisions(bySection, {}), 1);
    assert.equal(
      areGate2SectionDecisionsComplete(bySection, { 'task:1': { action: 'accept' } }),
      true
    );
  });
});
