/**
 * Pagination schemas — offset (Spring-style docs) + cursor (pageToken).
 */

const PageQuery = {
  name: 'page',
  in: 'query',
  required: false,
  description: 'Số trang (1-based). Runtime một số API dùng cùng tên.',
  schema: { type: 'integer', minimum: 1, default: 1, example: 1 },
};

const SizeQuery = {
  name: 'size',
  in: 'query',
  required: false,
  description:
    'Kích thước trang. Runtime có thể nhận alias `limit` thay cho `size` — không đổi contract API.',
  schema: { type: 'integer', minimum: 1, maximum: 100, default: 20, example: 20 },
};

const PageTokenQuery = {
  name: 'pageToken',
  in: 'query',
  required: false,
  description: 'Opaque cursor từ `nextPageToken` của trang trước (chat/list cursor).',
  schema: { type: 'string', example: 'eyJ2IjoxLCJpZCI6Ii4uLiJ9' },
};

/** Offset page — docs chuẩn: page, size, totalElements, totalPages, content */
const PageResponse = {
  type: 'object',
  required: ['page', 'size', 'totalElements', 'totalPages', 'content'],
  description:
    'Phân trang offset. Map runtime phổ biến: size↔limit, totalElements↔total, content↔items/data.',
  properties: {
    page: {
      type: 'integer',
      minimum: 1,
      description: 'Trang hiện tại (1-based)',
      example: 1,
    },
    size: {
      type: 'integer',
      minimum: 1,
      description: 'Số phần tử mỗi trang (runtime: limit)',
      example: 20,
    },
    totalElements: {
      type: 'integer',
      minimum: 0,
      description: 'Tổng số phần tử (runtime: total)',
      example: 42,
    },
    totalPages: {
      type: 'integer',
      minimum: 0,
      description: 'Tổng số trang',
      example: 3,
    },
    content: {
      type: 'array',
      description: 'Danh sách phần tử trang hiện tại',
      items: { type: 'object' },
      example: [{ id: '507f1f77bcf86cd799439011' }],
    },
  },
};

const CursorPageResponse = {
  type: 'object',
  required: ['content', 'hasMore'],
  description: 'Phân trang cursor (pageToken) — chat messages, v.v.',
  properties: {
    content: {
      type: 'array',
      description: 'Phần tử trang hiện tại',
      items: { type: 'object' },
      example: [],
    },
    nextPageToken: {
      type: 'string',
      nullable: true,
      description: 'Token trang tiếp; null nếu hết',
      example: null,
    },
    hasMore: {
      type: 'boolean',
      description: 'Còn trang sau',
      example: false,
    },
  },
};

module.exports = {
  PageQuery,
  SizeQuery,
  PageTokenQuery,
  PageResponse,
  CursorPageResponse,
};
