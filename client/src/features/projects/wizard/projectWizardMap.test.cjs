const test = require('node:test');
const assert = require('node:assert/strict');
const {
  PROJECT_WIZARD_STEPS,
  mapWorkflowCardToBackend,
  resolveWorkflowCard,
} = require('./projectWizardMap.cjs');

test('T1 work-type defaults + views catalog ids', () => {
  const { PROJECT_WIZARD_STEPS } = require('./projectWizardMap.cjs');
  assert.equal(PROJECT_WIZARD_STEPS.length, 3);
  assert.equal(PROJECT_WIZARD_STEPS[0], 'name');
  assert.equal(PROJECT_WIZARD_STEPS[1], 'setup');
  assert.equal(PROJECT_WIZARD_STEPS[2], 'team');
});

test('T1 workflow cards map + preview columns', () => {
  assert.deepEqual(mapWorkflowCardToBackend('agile'), {
    methodology: 'scrum',
    workflowTemplateKey: 'startup',
  });
  assert.deepEqual(mapWorkflowCardToBackend('scrum'), {
    methodology: 'scrum',
    workflowTemplateKey: 'sme',
  });
  assert.deepEqual(mapWorkflowCardToBackend('kanban'), {
    methodology: 'kanban',
    workflowTemplateKey: 'default_board',
  });
  assert.ok(resolveWorkflowCard('scrum').columns.includes('Review'));
  assert.equal(resolveWorkflowCard('kanban').columns[1], 'In Progress');
});
