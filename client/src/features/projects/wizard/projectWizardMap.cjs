/**
 * Pure maps for fullscreen wizard (node:test).
 */
const PROJECT_WIZARD_STEPS = Object.freeze(['name', 'setup', 'team']);

const PROJECT_WORKFLOW_CARDS = Object.freeze([
  {
    id: 'agile',
    methodology: 'scrum',
    workflowTemplateKey: 'startup',
    columns: Object.freeze(['To Do', 'Doing', 'Done']),
  },
  {
    id: 'scrum',
    methodology: 'scrum',
    workflowTemplateKey: 'sme',
    columns: Object.freeze(['To Do', 'Doing', 'Review', 'Done']),
  },
  {
    id: 'kanban',
    methodology: 'kanban',
    workflowTemplateKey: 'default_board',
    columns: Object.freeze(['To Do', 'In Progress', 'In Review', 'Done']),
  },
]);

function resolveWorkflowCard(cardId) {
  const id = String(cardId || '').trim().toLowerCase();
  return PROJECT_WORKFLOW_CARDS.find((c) => c.id === id) || PROJECT_WORKFLOW_CARDS[2];
}

function mapWorkflowCardToBackend(cardId) {
  const card = resolveWorkflowCard(cardId);
  return {
    methodology: card.methodology,
    workflowTemplateKey: card.workflowTemplateKey,
  };
}

module.exports = {
  PROJECT_WIZARD_STEPS,
  PROJECT_WORKFLOW_CARDS,
  resolveWorkflowCard,
  mapWorkflowCardToBackend,
};
