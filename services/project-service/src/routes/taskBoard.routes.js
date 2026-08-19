const express = require('express');
const controller = require('../controllers/taskBoard.controller');

const router = express.Router();

router.post('/', controller.createBoard.bind(controller));
router.get('/', controller.listBoards.bind(controller));

// Card — segment cố định trước /:boardId
router.patch('/cards/:cardId/move', controller.moveCard.bind(controller));
router.post('/cards/:cardId/copy', controller.copyCard.bind(controller));
router.delete('/cards/:cardId', controller.archiveCard.bind(controller));
router.post('/cards/:cardId/archive', controller.archiveCard.bind(controller));
router.post('/cards/:cardId/comments', controller.addCardComment.bind(controller));
router.patch('/cards/:cardId', controller.updateCard.bind(controller));
router.post('/features/:featureId/workgroup', controller.createWorkGroup.bind(controller));

// List actions (có boardId — khớp mount gateway)
router.patch('/:boardId/lists/:listId', controller.reorderList.bind(controller));
router.post('/:boardId/lists/:listId/copy', controller.copyList.bind(controller));
router.post('/:boardId/lists/:listId/move', controller.moveList.bind(controller));
router.post('/:boardId/lists/:listId/move-all-cards', controller.moveAllCardsInList.bind(controller));
router.put('/:boardId/lists/:listId/watch', controller.watchList.bind(controller));
router.post('/:boardId/lists/:listId/watch', controller.watchList.bind(controller));
router.delete('/:boardId/lists/:listId/watch', controller.unwatchList.bind(controller));
router.delete('/:boardId/lists/:listId', controller.archiveList.bind(controller));
router.post('/:boardId/lists/:listId/archive', controller.archiveList.bind(controller));

// Alias không boardId (tương thích)
router.patch('/lists/:listId', controller.reorderList.bind(controller));
router.post('/lists/:listId/copy', controller.copyList.bind(controller));
router.post('/lists/:listId/move', controller.moveList.bind(controller));
router.post('/lists/:listId/move-all-cards', controller.moveAllCardsInList.bind(controller));
router.put('/lists/:listId/watch', controller.watchList.bind(controller));
router.post('/lists/:listId/watch', controller.watchList.bind(controller));
router.delete('/lists/:listId/watch', controller.unwatchList.bind(controller));

router.get('/:boardId/assignable-members', controller.listAssignableMembers.bind(controller));
router.get('/:boardId', controller.getBoardDetail.bind(controller));
router.patch('/:boardId', controller.patchBoard.bind(controller));
router.post('/:boardId/archive', controller.archiveBoard.bind(controller));
router.post('/:boardId/lists', controller.createList.bind(controller));
router.post('/:boardId/cards', controller.createCard.bind(controller));

// Project Team + Delegation Graph + Assignment evaluate
const delivery = require('../controllers/projectDelivery.controller');
router.get('/:boardId/project-roles', delivery.listRoles);
router.get('/:boardId/project-members', delivery.listMembers);
router.put('/:boardId/project-members/:memberUserId/roles', delivery.putMemberRoles);
router.get('/:boardId/delegation', delivery.listDelegation);
router.put('/:boardId/delegation/edges', delivery.putDelegationEdge);
router.delete('/:boardId/delegation/edges/:edgeId', delivery.removeDelegationEdge);
router.post('/:boardId/delegation/apply-template', delivery.postApplyTemplate);
router.post('/:boardId/assign/evaluate', delivery.evaluateAssign);

// Sprint + Workflow + Transfer
const boardOps = require('../controllers/boardOps.controller');
router.get('/:boardId/sprints', boardOps.listSprints);
router.post('/:boardId/sprints', boardOps.createSprint);
router.patch('/:boardId/sprints/:sprintId', boardOps.updateSprint);
router.delete('/:boardId/sprints/:sprintId', boardOps.deleteSprint);
router.post('/:boardId/sprints/:sprintId/cards', boardOps.assignSprintCards);
router.delete('/:boardId/sprints/:sprintId/cards/:cardId', boardOps.removeSprintCard);
router.get('/:boardId/workflow', boardOps.getWorkflow);
router.put('/:boardId/workflow', boardOps.putWorkflow);
router.post('/:boardId/workflow/seed-default', boardOps.seedWorkflow);
router.post('/:boardId/workflow/apply-template', boardOps.applyWorkflowTemplate);
router.post('/:boardId/transfer', boardOps.transferBoard);

module.exports = router;
