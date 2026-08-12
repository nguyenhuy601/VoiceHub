/**
 * Curated Voice recording upload + Documents + Roles + AI samples.
 */

const { buildOperation, pathParam } = require('../components/op.helpers');

module.exports = {
  '/api/meetings/{meetingId}/recording/upload': {
    post: buildOperation({
      operationId: 'uploadMeetingRecording',
      tags: ['Voice'],
      summary: 'Upload meeting recording',
      description:
        'multipart/form-data. Accepted audio/video types per voice-service middleware; max size theo multer config.',
      parameters: [pathParam('meetingId', 'Meeting id')],
      requestBody: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: { $ref: '#/components/schemas/UploadRecordingMultipart' },
          },
        },
      },
      successExample: { success: true, data: { recordingId: '507f1f77bcf86cd799439011' } },
    }),
  },
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
  '/api/ai/tasks': {
    get: buildOperation({
      operationId: 'listAiTasks',
      tags: ['AI'],
      summary: 'List AI tasks',
      description: 'AI task jobs for org/user.',
      requireNotFound: false,
      successExample: { success: true, data: [] },
    }),
  },
  '/api/ai/summaries': {
    get: buildOperation({
      operationId: 'listAiSummaries',
      tags: ['AI'],
      summary: 'List AI summaries',
      description: 'Summary artifacts.',
      requireNotFound: false,
      successExample: { success: true, data: [] },
    }),
  },
};
