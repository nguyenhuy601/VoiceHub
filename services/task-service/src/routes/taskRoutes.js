const express = require('express');
const router = express.Router();
const taskController = require('../controllers/taskController');
const { protect } = require('../middleware/auth');

router.use(protect);

router.get('/', taskController.getTasks);
router.post('/', taskController.createTask);
router.get('/statistics', taskController.getStatistics);
router.get('/:id', taskController.getTask);
router.put('/:id', taskController.updateTask);
router.delete('/:id', taskController.deleteTask);
router.patch('/:id/status', taskController.updateStatus);
router.post('/:id/assign', taskController.assignTask);

module.exports = router;
