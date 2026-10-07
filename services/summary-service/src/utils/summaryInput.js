const { SummaryError } = require('./summaryErrors');

const OBJECT_ID_PATTERN = /^[a-f0-9]{24}$/i;
const MAX_MESSAGES_LIMIT = 500;

const DEFAULT_MAX_MESSAGES = Math.min(
  Math.max(parseInt(process.env.SUMMARY_DEFAULT_MAX_MESSAGES || '200', 10) || 200, 1),
  MAX_MESSAGES_LIMIT
);

function isObjectIdString(value) {
  return typeof value === 'string' && OBJECT_ID_PATTERN.test(value);
}

function parseBoolStrict(value) {
  return value === true || value === 1 || value === 'true' || value === '1';
}

function requireObjectId(value) {
  const trimmed = typeof value === 'string' ? value.trim() : value;
  if (!isObjectIdString(trimmed)) throw new SummaryError('SUMMARY_BAD_REQUEST');
  return trimmed;
}

function parseMaxMessages(value) {
  const n = typeof value === 'number' ? value : parseInt(value, 10);
  if (!Number.isInteger(n) || n < 1) return DEFAULT_MAX_MESSAGES;
  return Math.min(n, MAX_MESSAGES_LIMIT);
}

function parseSinceMessageId(value) {
  if (value == null || value === '') return '';
  return requireObjectId(value);
}

function parseCreateSummaryInput(body) {
  const src = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  if (src.scope != null && src.scope !== 'org_channel') {
    throw new SummaryError('SUMMARY_SCOPE_UNSUPPORTED');
  }
  const rawOptions =
    src.options && typeof src.options === 'object' && !Array.isArray(src.options) ? src.options : {};

  return {
    organizationId: requireObjectId(src.organizationId),
    roomId: requireObjectId(src.roomId),
    options: {
      unreadOnly: parseBoolStrict(rawOptions.unreadOnly),
      sinceMessageId: parseSinceMessageId(rawOptions.sinceMessageId),
      maxMessages: parseMaxMessages(rawOptions.maxMessages),
    },
  };
}

function parseLatestQuery(query) {
  const src = query && typeof query === 'object' ? query : {};
  return {
    organizationId: requireObjectId(src.organizationId),
    roomId: requireObjectId(src.roomId),
  };
}

module.exports = {
  DEFAULT_MAX_MESSAGES,
  MAX_MESSAGES_LIMIT,
  isObjectIdString,
  parseBoolStrict,
  parseCreateSummaryInput,
  parseLatestQuery,
};
