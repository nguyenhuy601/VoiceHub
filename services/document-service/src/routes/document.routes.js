const express = require('express');
const router = express.Router();
const documentController = require('../controllers/document.controller');

// Tạo document mới
router.post('/', documentController.createDocument.bind(documentController));

// Lấy danh sách documents
router.get('/', documentController.getDocuments.bind(documentController));

// Lấy document theo ID
router.get('/:documentId', documentController.getDocumentById.bind(documentController));

// Cập nhật document
router.patch('/:documentId', documentController.updateDocument.bind(documentController));
router.put('/:documentId', documentController.updateDocument.bind(documentController));

// Upload version mới
router.post('/:documentId/versions', documentController.uploadNewVersion.bind(documentController));

// Xóa document
router.delete('/:documentId', documentController.deleteDocument.bind(documentController));

module.exports = router;



