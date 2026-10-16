const express = require('express');
const router = express.Router();
const documentController = require('../controllers/document.controller');

router.post('/', documentController.createDocument.bind(documentController));
router.get('/', documentController.getDocuments.bind(documentController));
router.get('/:documentId', documentController.getDocumentById.bind(documentController));
router.patch('/:documentId', documentController.updateDocument.bind(documentController));
router.put('/:documentId', documentController.updateDocument.bind(documentController));
router.post('/:documentId/versions', documentController.uploadNewVersion.bind(documentController));
router.delete('/:documentId', documentController.deleteDocument.bind(documentController));

module.exports = router;
