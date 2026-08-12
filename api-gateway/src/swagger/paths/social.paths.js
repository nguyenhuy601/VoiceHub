/**
 * Curated Chat (cursor page) + Friends + Notifications samples.
 */

const { buildOperation, pathParam } = require('../components/op.helpers');
const { PageTokenQuery, SizeQuery } = require('../components/pagination.schemas');

module.exports = {
  '/api/messages': {
    get: buildOperation({
      operationId: 'listMessages',
      tags: ['Chat'],
      summary: 'List messages (cursor)',
      description:
        'Cursor pagination: query pageToken + size/limit. Response CursorPageResponse (content, nextPageToken, hasMore).',
      requireNotFound: false,
      parameters: [
        {
          name: 'conversationId',
          in: 'query',
          required: true,
          description: 'Conversation / channel id',
          schema: { type: 'string', example: '507f1f77bcf86cd799439011' },
        },
        PageTokenQuery,
        SizeQuery,
      ],
      successSchema: { $ref: '#/components/schemas/CursorPageResponse' },
      successExample: {
        content: [{ _id: '507f1f77bcf86cd799439011', text: 'Hello' }],
        nextPageToken: null,
        hasMore: false,
      },
    }),
  },
  '/api/friends': {
    get: buildOperation({
      operationId: 'listFriends',
      tags: ['Friends'],
      summary: 'List friends',
      description: 'Danh sách bạn bè. Query status=blocked để lấy blocked list.',
      requireNotFound: false,
      parameters: [
        {
          name: 'status',
          in: 'query',
          required: false,
          description: 'Filter: accepted | pending | blocked',
          schema: {
            type: 'string',
            enum: ['accepted', 'pending', 'blocked'],
            example: 'accepted',
          },
        },
      ],
      successExample: { success: true, data: [] },
    }),
  },
  '/api/notifications': {
    get: buildOperation({
      operationId: 'listNotifications',
      tags: ['Notifications'],
      summary: 'List notifications',
      description: 'In-app notifications for current user. Pagination page/size.',
      requireNotFound: false,
      successExample: {
        success: true,
        data: {
          page: 1,
          size: 20,
          totalElements: 0,
          totalPages: 0,
          content: [],
        },
      },
    }),
  },
};
