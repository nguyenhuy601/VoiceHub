/**
 * Canonical Project API — Project ⊃ Board (projectId ≠ boardId).
 * Kanban card/list ops: /api/tasks/boards/:boardId (legacy mount).
 */
const express = require('express');
const catalog = require('../controllers/projectRoleCatalog.controller');
const projectRoleAdminRoutes = require('./projectRoleAdmin.routes');
const controller = require('../controllers/project.controller');
const planning = require('../controllers/planning.controller');
const resource = require('../controllers/resource.controller');
const workflowTemplates = require('../controllers/workflowTemplate.controller');
const approval = require('../controllers/approval.controller');
const governance = require('../controllers/governance.controller');

const router = express.Router();

router.get('/role-catalog', catalog.listRoleCatalog);
router.use('/admin/roles', projectRoleAdminRoutes);

/** Resource Management (Phase 3) — trước /:projectId */
router.get('/resources/capacity', resource.getCapacity);
router.get('/resources/planner', resource.getPlanner);
router.get('/resources/users/:userId/allocations', resource.getUserAllocations);

/** Phase 4 — Workflow template catalog */
router.get('/workflow-templates', workflowTemplates.listTemplates);
router.post('/workflow-templates', workflowTemplates.upsertTemplate);
router.put('/workflow-templates/:templateId', workflowTemplates.upsertTemplate);

/** Phase 5 — Approval System */
router.get('/approval-policies', approval.listPolicies);
router.post('/approval-policies', approval.upsertPolicy);
router.put('/approval-policies/:policyId', approval.upsertPolicy);
router.get('/approvals/inbox', approval.listInbox);
router.post('/approvals/:requestId/decide', approval.decide);
router.post('/approvals/:requestId/cancel', approval.cancel);
router.get('/approvals/entity/:entityType/:entityId', approval.listEntity);
router.post('/approvals/stub', approval.startStub);

/** Phase 6 — Enterprise Governance */
router.get('/audit-events', governance.listAuditEvents);
router.delete('/audit-events/:eventId', governance.deleteAuditEvent);
router.get('/governance/director-health', governance.directorHealth);
router.get('/governance/retention', governance.getRetention);
router.put('/governance/retention', governance.putRetention);
router.post('/governance/retention/run-stub', governance.runRetentionStub);
router.get('/governance/security-flags', governance.securityFlags);

router.post('/', controller.createProject);
router.get('/', controller.listProjects);

router.get('/:projectId/overview', controller.getOverview);
router.get('/:projectId/activity', controller.getActivity);
router.get('/:projectId/files', controller.getFiles);
router.get('/:projectId/members', controller.listMembers);
router.get('/:projectId/member-candidates', controller.listMemberCandidatesController);
router.get('/:projectId/resources/planner', resource.getPlanner);
router.post('/:projectId/workflow/apply', workflowTemplates.applyToProject);
router.put('/:projectId/approval-policy', approval.bindProjectPolicy);
router.put('/:projectId/members/:memberUserId/roles', controller.putMemberRoles);
router.get('/:projectId/boards', controller.listBoards);
router.post('/:projectId/boards', controller.createBoard);
router.get('/:projectId/sprints', controller.listSprints);
router.post('/:projectId/sprints', controller.createSprint);
router.patch('/:projectId/sprints/:sprintId', controller.patchSprint);

router.get('/:projectId/technical-setup', controller.getTechnicalSetup);
router.put('/:projectId/technical-setup', controller.putTechnicalSetup);
router.post('/:projectId/technical-setup/complete', controller.completeTechnicalSetup);

router.get('/:projectId/planning-items', planning.listItems);
router.post('/:projectId/planning-items', planning.createItem);
router.patch('/:projectId/planning-items/:itemId', planning.patchItem);
router.delete('/:projectId/planning-items/:itemId', planning.deleteItem);
router.get('/:projectId/backlog', planning.listBacklog);
router.patch('/:projectId/tasks/:taskId/planning', planning.linkTaskEpic);

router.post('/:projectId/archive', controller.archiveProject);
router.patch('/:projectId', controller.patchProject);
router.get('/:projectId', controller.getProject);

module.exports = router;
