/**
 * Pure maps for fullscreen wizard (node:test).
 * Scrum-only — legacy Agile/Kanban cards removed.
 */
const PROJECT_WIZARD_STEPS = Object.freeze(['intake']);

const PROJECT_WORKFLOW_CARDS = Object.freeze([
  {
    id: 'scrum',
    methodology: 'scrum',
    workflowTemplateKey: 'sme',
    columns: Object.freeze(['To Do', 'Doing', 'Review', 'Done']),
  },
]);

function resolveWorkflowCard(cardId) {
  const id = String(cardId || '').trim().toLowerCase();
  return PROJECT_WORKFLOW_CARDS.find((c) => c.id === id) || PROJECT_WORKFLOW_CARDS[0];
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
