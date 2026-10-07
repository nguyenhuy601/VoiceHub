const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');
const userContext = require('../middlewares/userContext');
const internalServiceAuth = require('../middlewares/internalServiceAuth');
const { protect } = require('../middleware/auth');
const { attachCompanyAdminIfPresent } = require('../middlewares/companyAdminAuth');
const upload = require('../middleware/upload');
const { cvUpload } = require('../middleware/cvUpload');

// Presence từ socket-service (trước userContext — không cần x-user-id)
router.patch(
  '/internal/status',
  internalServiceAuth,
  userController.patchInternalStatus.bind(userController)
);
router.patch(
  '/internal/email',
  internalServiceAuth,
  userController.patchInternalEmail.bind(userController)
);

router.post(
  '/internal/presence/batch',
  internalServiceAuth,
  userController.internalPresenceBatch.bind(userController)
);

// Đọc profile theo ID / SĐT — gọi nội bộ từ friend-service, chat-service (không có JWT user)
router.get(
  '/internal/profile/:userId',
  internalServiceAuth,
  userController.getUserProfileById.bind(userController)
);
router.get(
  '/internal/phone/:phone',
  internalServiceAuth,
  userController.getUserProfileByPhone.bind(userController)
);

router.get(
  '/internal/search',
  internalServiceAuth,
  userController.searchUsers.bind(userController)
);

// Bootstrap profile sau verify email — chỉ auth-service (x-internal-token)
router.post(
  '/internal/bootstrap',
  internalServiceAuth,
  userController.createUserProfile.bind(userController)
);

router.post(
  '/internal/profile/:userId/bulk-fields',
  internalServiceAuth,
  userController.internalBulkImportProfileFields.bind(userController)
);

router.post(
  '/internal/profile/:userId/deactivate',
  internalServiceAuth,
  userController.internalDeactivateProfile.bind(userController)
);

router.post(
  '/internal/profiles/batch',
  internalServiceAuth,
  userController.internalProfilesBatch.bind(userController)
);

// Các route còn lại: JWT bắt buộc (giống friend-service), rồi enrich profile
router.use(protect);
router.use(userContext);

// Lấy thông tin user hiện tại
router.get('/me', userController.getCurrentUser.bind(userController));

// Cập nhật status (phải trước /:userId vì /me/status có thể bị :userId match)
router.patch('/me/status', userController.updateStatus.bind(userController));

// Cập nhật user profile
router.patch('/me', userController.updateUserProfile.bind(userController));

/** Lỗi multer/fileFilter → errorCode cố định; không trả message thư viện. */
function singleFileUpload(uploader, fieldName, { errorCode, messageUser }) {
  return (req, res, next) => {
    uploader.single(fieldName)(req, res, (err) => {
      if (!err) return next();
      const isTooLarge = err.code === 'LIMIT_FILE_SIZE';
      const statusCode = isTooLarge ? 413 : 400;
      const message = isTooLarge ? 'File vượt quá dung lượng cho phép (5MB).' : messageUser;
      return res.status(statusCode).json({
        success: false,
        message,
        messageUser: message,
        errorCode: isTooLarge ? 'USER_UPLOAD_TOO_LARGE' : errorCode,
      });
    });
  };
}

router.post(
  '/avatar',
  singleFileUpload(upload, 'avatar', {
    errorCode: 'USER_AVATAR_INVALID_IMAGE',
    messageUser: 'Chỉ chấp nhận ảnh: jpg, jpeg, png, gif, webp, bmp, ico, avif, heic (không hỗ trợ SVG).',
  }),
  userController.uploadAvatar.bind(userController)
);

router.post(
  '/me/capability/cv',
  singleFileUpload(cvUpload, 'file', {
    errorCode: 'CV_UPLOAD_INVALID',
    messageUser: 'Chỉ chấp nhận file PDF (tối đa 5MB).',
  }),
  userController.uploadCapabilityCv.bind(userController)
);

// Tìm kiếm users
router.get('/search', userController.searchUsers.bind(userController));

// Lấy user profile theo số điện thoại
router.get('/phone/:phone', userController.getUserProfileByPhone.bind(userController));

// Lấy user profile theo username
router.get('/username/:username', userController.getUserProfileByUsername.bind(userController));

// Avatar có JWT (img tag dùng ?access_token= qua gateway)
router.get('/:userId/avatar', userController.getUserAvatar.bind(userController));

// Lấy / cập nhật profile theo ID — actor: peer GET, self PATCH, company admin (query/body org)
router.get(
  '/:userId',
  attachCompanyAdminIfPresent,
  userController.getUserProfileById.bind(userController)
);
router.patch(
  '/:userId',
  attachCompanyAdminIfPresent,
  userController.patchUserById.bind(userController)
);

// PUT self-only (giữ contract cũ)
router.put('/:userId', userController.updateUserProfile.bind(userController));

// Xóa user profile
router.delete('/:userId', userController.deleteUserProfile.bind(userController));

module.exports = router;



