const { createChatError } = require('./chatErrorMap');

const DURATION_MS = Object.freeze({
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '3d': 3 * 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
});

const MAX_QUESTION = 300;
const MAX_OPTION_TEXT = 120;

function buildPollFromInput(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw createChatError(400, 'CHAT_VALIDATION_ERROR', 'Dữ liệu khảo sát không hợp lệ.');
  }
  if (raw.votes != null || raw.closed != null || raw.closesAt != null) {
    throw createChatError(400, 'CHAT_VALIDATION_ERROR', 'Không được gửi phiếu hoặc trạng thái đóng từ client.');
  }
  const question = String(raw.question || '').trim();
  if (!question || question.length > MAX_QUESTION) {
    throw createChatError(400, 'CHAT_VALIDATION_ERROR', 'Câu hỏi khảo sát không hợp lệ.');
  }
  const incoming = Array.isArray(raw.options) ? raw.options : [];
  const texts = incoming
    .map((item) => (typeof item === 'string' ? item : item?.text))
    .map((item) => String(item || '').trim())
    .filter(Boolean);
  if (texts.length < 2 || texts.length > 6 || texts.some((text) => text.length > MAX_OPTION_TEXT)) {
    throw createChatError(400, 'CHAT_VALIDATION_ERROR', 'Khảo sát cần từ 2 đến 6 đáp án.');
  }
  const duration = String(raw.duration || '24h');
  const durationMs = DURATION_MS[duration];
  if (!durationMs) {
    throw createChatError(400, 'CHAT_VALIDATION_ERROR', 'Thời hạn khảo sát không hợp lệ.');
  }
  return {
    question,
    options: texts.map((text, index) => ({ id: `o${index + 1}`, text })),
    allowMulti: Boolean(raw.allowMulti ?? raw.allowMultiAnswer),
    closesAt: new Date(Date.now() + durationMs),
    closed: false,
    votes: [],
  };
}

function isPollClosed(poll, now = Date.now()) {
  if (!poll) return true;
  if (poll.closed) return true;
  if (poll.closesAt && new Date(poll.closesAt).getTime() <= now) return true;
  return false;
}

function assertVoteSelection(poll, optionIds, userId, now = Date.now()) {
  if (!poll) {
    throw createChatError(400, 'CHAT_VALIDATION_ERROR', 'Tin nhắn không phải khảo sát.');
  }
  if (poll.closed) {
    throw createChatError(400, 'CHAT_POLL_CLOSED', 'Khảo sát đã đóng.');
  }
  if (poll.closesAt && new Date(poll.closesAt).getTime() <= now) {
    throw createChatError(400, 'CHAT_POLL_EXPIRED', 'Khảo sát đã hết hạn.');
  }
  const ids = [...new Set((Array.isArray(optionIds) ? optionIds : []).map((id) => String(id || '').trim()).filter(Boolean))];
  const valid = new Set((poll.options || []).map((opt) => String(opt.id)));
  if (!ids.length || ids.some((id) => !valid.has(id))) {
    throw createChatError(400, 'CHAT_VALIDATION_ERROR', 'Đáp án không hợp lệ.');
  }
  if (!poll.allowMulti && ids.length !== 1) {
    throw createChatError(400, 'CHAT_VALIDATION_ERROR', 'Khảo sát này chỉ chọn một đáp án.');
  }
  const me = String(userId || '');
  const existing = (poll.votes || []).find((vote) => String(vote.userId) === me);
  if (existing && !poll.allowMulti) {
    throw createChatError(400, 'CHAT_POLL_ALREADY_VOTED', 'Bạn đã bỏ phiếu.');
  }
  return ids;
}

function toPublicPoll(poll, viewerId, now = Date.now()) {
  if (!poll || typeof poll !== 'object') return undefined;
  const counts = {};
  for (const opt of poll.options || []) counts[String(opt.id)] = 0;
  for (const vote of poll.votes || []) {
    for (const id of vote.optionIds || []) {
      const key = String(id);
      if (counts[key] != null) counts[key] += 1;
    }
  }
  const me = String(viewerId || '');
  const mine = (poll.votes || []).find((vote) => String(vote.userId) === me);
  return {
    question: poll.question,
    options: (poll.options || []).map((opt) => ({
      id: String(opt.id),
      text: opt.text,
      count: counts[String(opt.id)] || 0,
    })),
    allowMulti: Boolean(poll.allowMulti),
    closesAt: poll.closesAt || null,
    closed: isPollClosed(poll, now),
    viewerVoteOptionIds: mine ? (mine.optionIds || []).map(String) : [],
  };
}

module.exports = {
  DURATION_MS,
  buildPollFromInput,
  isPollClosed,
  assertVoteSelection,
  toPublicPoll,
};
