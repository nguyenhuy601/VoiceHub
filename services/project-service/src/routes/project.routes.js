/**
 * Canonical Project API — Project ⊃ Board (projectId ≠ boardId).
 * Kanban card/list ops: /api/tasks/boards/:boardId (legacy mount).
 */
const express = require('express');
const internalGatewayAuth = require('@enterprise/shared/middleware/internalGatewayAuth');
const catalog = require('../controllers/projectRoleCatalog.controller');
const projectRoleAdminRoutes = require('./projectRoleAdmin.routes');
const controller = require('../controllers/project.controller');
const planning = require('../controllers/planning.controller');
const changeRequest = require('../controllers/changeRequest.controller');
const resource = require('../controllers/resource.controller');
const workPreview = require('../controllers/workPreview.controller');
const workflowTemplates = require('../controllers/workflowTemplate.controller');
const approval = require('../controllers/approval.controller');
const governance = require('../controllers/governance.controller');

const router = express.Router();

/**
 * @openapi
 * /api/projects/role-catalog:
 *   get:
 *     tags: [Projects]
 *     summary: Project Role catalog (enabled Master Data)
 *     description: Catalog runtime sync từ enabledProjectRoleKeys. Header x-organization-id bắt buộc.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: x-organization-id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Roles
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiSuccess'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get('/role-catalog', catalog.listRoleCatalog);
router.use('/admin/roles', projectRoleAdminRoutes);

/** Resource Management (Phase 3 / 3b) — trước /:projectId */
router.get('/resources/capacity', resource.getCapacity);
router.get('/resources/planner', resource.getPlanner);
router.get('/resources/utilization', resource.getUtilization);
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
router.post('/internal/audit-events', internalGatewayAuth, governance.ingestAuditEvent);
router.get('/audit-events', governance.listAuditEvents);
router.delete('/audit-events/:eventId', governance.deleteAuditEvent);
router.get('/governance/director-health', governance.directorHealth);
router.get('/governance/retention', governance.getRetention);
router.put('/governance/retention', governance.putRetention);
router.post('/governance/retention/run-stub', governance.runRetentionStub);
router.get('/governance/security-flags', governance.securityFlags);

router.post('/', controller.createProject);

/**
 * @openapi
 * /api/projects:
 *   get:
 *     tags: [Projects]
 *     summary: List projects visible to user
 *     description: Visibility theo policy org + membership.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: organizationId
 *         schema: { type: string }
 *         description: Lọc theo org
 *     responses:
 *       200:
 *         description: Project list
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiSuccess'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get('/', controller.listProjects);

router.get('/:projectId/overview', controller.getOverview);
router.get('/:projectId/activity', controller.getActivity);
router.get('/:projectId/files', controller.getFiles);
router.get('/:projectId/work-preview', workPreview.getWorkPreview);

/**
 * @openapi
 * /api/projects/{projectId}/members:
 *   get:
 *     tags: [Projects]
 *     summary: List project members + roles
 *     description: ProjectMembership (lớp C assignment).
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Members
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiSuccess'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get('/:projectId/members', controller.listMembers);
router.get('/:projectId/member-candidates', controller.listMemberCandidatesController);
router.get('/:projectId/resources/planner', resource.getPlanner);
router.post('/:projectId/workflow/apply', workflowTemplates.applyToProject);
router.put('/:projectId/approval-policy', approval.bindProjectPolicy);

/**
 * @openapi
 * /api/projects/{projectId}/members/{memberUserId}/roles:
 *   put:
 *     tags: [Projects]
 *     summary: Set project member roles (project-level write)
 *     description: SSOT write path — Team panel và Resource Planner cùng endpoint này.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: memberUserId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [projectRoleKeys]
 *             properties:
 *               projectRoleKeys:
 *                 type: array
 *                 items: { type: string }
 *                 minItems: 1
 *               boardRole: { type: string }
 *               allocations:
 *                 type: array
 *                 items: { type: object }
 *     responses:
 *       200:
 *         description: Updated membership
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiSuccess'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.put('/:projectId/members/:memberUserId/roles', controller.putMemberRoles);
router.get('/:projectId/boards', controller.listBoards);
router.post('/:projectId/boards', controller.createBoard);
router.get('/:projectId/sprints', controller.listSprints);
router.post('/:projectId/sprints', controller.createSprint);
router.patch('/:projectId/sprints/:sprintId', controller.patchSprint);
router.delete('/:projectId/sprints/:sprintId', controller.deleteSprint);
router.get('/:projectId/sprints/:sprintId/complete-preview', controller.completeSprintPreview);
router.post('/:projectId/sprints/:sprintId/complete', controller.completeSprint);
router.get(
  '/:projectId/sprints/:sprintId/time-summary',
  require('../controllers/worklog.controller').getSprintTimeSummaryController
);

router.get('/:projectId/change-requests', changeRequest.listItems);
router.post('/:projectId/change-requests', changeRequest.createItem);
router.get('/:projectId/change-requests/:crId', changeRequest.getItem);
router.patch('/:projectId/change-requests/:crId', changeRequest.patchItem);
router.post('/:projectId/change-requests/:crId/submit-approval', changeRequest.submitApproval);
router.delete('/:projectId/change-requests/:crId', changeRequest.deleteItem);

router.get('/:projectId/planning-items', planning.listItems);
router.post('/:projectId/planning-items', planning.createItem);
router.get(
  '/:projectId/planning-items/:itemId/history',
  require('../controllers/workHistory.controller').listPlanningItem
);
router.patch('/:projectId/planning-items/:itemId', planning.patchItem);
router.delete('/:projectId/planning-items/:itemId', planning.deleteItem);
router.get('/:projectId/backlog', planning.listBacklog);
router.patch('/:projectId/tasks/:taskId/planning', planning.linkTaskEpic);

router.get('/:projectId/complete-preview', controller.completeProjectPreview);
router.post('/:projectId/complete', controller.completeProject);
router.post('/:projectId/archive', controller.archiveProject);
router.patch('/:projectId', controller.patchProject);
router.get('/:projectId', controller.getProject);

module.exports = router;
