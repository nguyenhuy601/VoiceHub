/**
 * Curated Documents + Roles samples.
 */

const { buildOperation, pathParam } = require('../components/op.helpers');

module.exports = {
  '/api/documents': {
    get: buildOperation({
      operationId: 'listDocuments',
      tags: ['Documents'],
      summary: 'List documents',
      description: 'Documents visible to user in org/project context.',
      requireNotFound: false,
      successExample: { success: true, data: [] },
    }),
  },
  '/api/documents/{documentId}/versions': {
    post: buildOperation({
      operationId: 'uploadDocumentVersion',
      tags: ['Documents'],
      summary: 'Upload new document version',
      description: 'multipart hoặc signed upload tùy document-service.',
      parameters: [pathParam('documentId', 'Document id')],
      requestBody: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              properties: {
                file: { type: 'string', format: 'binary', description: 'Document file' },
              },
            },
          },
        },
      },
      successExample: { success: true, data: { version: 2 } },
    }),
  },
  '/api/roles': {
    get: buildOperation({
      operationId: 'listSystemRoles',
      tags: ['Roles'],
      summary: 'List system roles',
      description: 'System Role catalog (permission bundles) — không nhầm Org/Project Role.',
      requireNotFound: false,
      successExample: { success: true, data: [] },
    }),
  },
};
