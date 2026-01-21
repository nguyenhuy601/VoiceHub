const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { protect } = require('../middleware/auth');
const upload = require('../middleware/upload');

router.use(protect);

router.get('/search', userController.searchUsers);
router.get('/profile', userController.getMyProfile);
router.put('/profile', userController.updateProfile);
router.post('/avatar', upload.single('avatar'), userController.uploadAvatar);
router.get('/:id', userController.getUserById);
router.get('/:id/status', userController.getUserStatus);
router.put('/status', userController.updateStatus);

module.exports = router;
