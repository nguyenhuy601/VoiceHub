const axios = require('axios');
const {
  CONVERSATION_SUMMARY_GENERATE_QUEUE,
  CONVERSATION_SUMMARY_DLQ_QUEUE,
} = require('@enterprise/shared/messaging/conversationSummaryEvents');

const CHAT_SERVICE_URL = String(process.env.CHAT_SERVICE_URL || '').trim().replace(/\/+$/, '');
const CHAT_INTERNAL_TOKEN = String(process.env.CHAT_INTERNAL_TOKEN || '').trim();

const MAX_PROMPT_CHARS = Math.max(
  4000,
  parseInt(process.env.SUMMARY_MAX_PROMPT_CHARS || '24000', 10) || 24000
);

function formatTimeLabel(date) {
  try {
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return '??:??';
    return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch {
    return '??:??';
  }
}

function buildTranscriptLines(messages) {
  return (messages || []).map((m) => {
    const time = formatTimeLabel(m.createdAt);
    const sender = String(m.senderDisplayName || m.senderId || 'User').slice(0, 64);
    const body = String(m.content || '').trim() || '[trống]';
    return `[${time}] ${sender}: ${body}`;
  });
}

function buildSummaryPrompt({ messages, organizationId, roomId }) {
  const lines = buildTranscriptLines(messages);
  let transcript = lines.join('\n');
  if (transcript.length > MAX_PROMPT_CHARS) {
    transcript = transcript.slice(transcript.length - MAX_PROMPT_CHARS);
  }

  return `Bạn là trợ lý tóm tắt hội thoại làm việc. Phân tích cuộc trò chuyện kênh tổ chức và trả về MỘT object JSON thuần (không markdown, không giải thích thêm).

Yêu cầu output JSON:
{
  "overview": "tóm tắt ngắn 2-4 câu",
  "keyPoints": ["điểm chính 1", "..."],
  "actionItems": [
    { "title": "việc cần làm", "assigneeHint": "tên người nếu có", "dueDateHint": "deadline nếu có" }
  ],
  "participants": ["tên hoặc id người tham gia đáng chú ý"],
  "language": "vi"
}

Ngữ cảnh: organizationId=${organizationId}, roomId=${roomId}
Số tin nhắn: ${messages.length}

--- HỘI THOẠI ---
${transcript}
--- HẾT ---`;
}

async function fetchOrgThreadExport({ organizationId, roomId, generatedBy, options }) {
  if (!CHAT_SERVICE_URL || !CHAT_INTERNAL_TOKEN) {
    throw new Error('CHAT_INTERNAL_TOKEN is not set');
  }

  const params = {
    organizationId,
    roomId,
    userId: generatedBy,
    limit: options?.maxMessages,
    unreadOnly: options?.unreadOnly ? '1' : undefined,
    readerId: options?.unreadOnly ? generatedBy : undefined,
    sinceMessageId: options?.sinceMessageId || undefined,
  };

  const res = await axios.get(`${CHAT_SERVICE_URL}/api/messages/internal/threads/org-export`, {
    headers: { 'x-internal-token': CHAT_INTERNAL_TOKEN },
    params,
    timeout: 30000,
    validateStatus: () => true,
  });

  if (res.status !== 200 || !res.data?.success) {
    throw new Error(`Org export failed HTTP ${res.status}`);
  }

  return res.data.data;
}

function safeParseJsonFromOllama(data) {
  const text = typeof data?.response === 'string' ? data.response : JSON.stringify(data || {});
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Model output has no JSON object');
  }
  return JSON.parse(text.slice(start, end + 1));
}

async function callOllama(prompt) {
  if (String(process.env.LLM_PROVIDER || 'ollama').toLowerCase() === 'mock') {
    return {
      response: JSON.stringify({
        overview: 'Tóm tắt mock: cuộc hội thoại có các chủ đề chính và vài việc cần theo dõi.',
        keyPoints: ['Điểm chính mock 1', 'Điểm chính mock 2'],
        actionItems: [
          { title: 'Hoàn thành báo cáo', assigneeHint: 'Team', dueDateHint: 'cuối tuần' },
        ],
        participants: ['User A', 'User B'],
        language: 'vi',
      }),
    };
  }

  const baseUrl = String(process.env.OLLAMA_BASE_URL || '').trim().replace(/\/+$/, '');
  const model = process.env.OLLAMA_MODEL || 'qwen2.5:3b-instruct';

  const res = await axios.post(
    `${baseUrl}/api/generate`,
    {
      model,
      prompt,
      stream: false,
      options: { temperature: 0.2 },
    },
    { timeout: 120000, validateStatus: () => true }
  );

  if (res.status < 200 || res.status >= 300) {
    const detail =
      (res.data && typeof res.data === 'object' && res.data.error) ||
      (typeof res.data === 'string' ? res.data : '');
    throw new Error(detail ? `Ollama HTTP ${res.status}: ${detail}` : `Ollama HTTP ${res.status}`);
  }

  return res.data;
}

function normalizeResult(parsed, exportData) {
  const actionItems = Array.isArray(parsed?.actionItems)
    ? parsed.actionItems
        .filter((item) => item && String(item.title || '').trim())
        .map((item) => ({
          title: String(item.title || '').trim().slice(0, 300),
          assigneeHint: String(item.assigneeHint || '').trim().slice(0, 120),
          dueDateHint: String(item.dueDateHint || '').trim().slice(0, 120),
        }))
    : [];

  const keyPoints = Array.isArray(parsed?.keyPoints)
    ? parsed.keyPoints.map((p) => String(p || '').trim()).filter(Boolean).slice(0, 20)
    : [];

  const participants = Array.isArray(parsed?.participants)
    ? parsed.participants.map((p) => String(p || '').trim()).filter(Boolean).slice(0, 30)
    : [];

  return {
    overview: String(parsed?.overview || '').trim(),
    keyPoints,
    actionItems,
    participants,
    language: String(parsed?.language || 'vi').slice(0, 8),
    messageRange: {
      fromMessageId: exportData?.firstMessageId || '',
      toMessageId: exportData?.lastMessageId || '',
      count: exportData?.messageCount || 0,
    },
  };
}

function sanitizeWorkerErrorMessage(err) {
  const msg = String(err?.message || '').toLowerCase();
  if (!msg) return 'Không thể tóm tắt hội thoại lúc này';
  if (msg.includes('chat_internal_token') || msg.includes('timeout') || msg.includes('econn')) {
    return 'Kết nối dịch vụ đang gián đoạn, vui lòng thử lại';
  }
  if (msg.includes('ollama') || msg.includes('model output')) {
    return 'Dịch vụ AI đang bận, vui lòng thử lại sau';
  }
  return 'Không thể tóm tắt hội thoại lúc này';
}

module.exports = {
  CONVERSATION_SUMMARY_GENERATE_QUEUE,
  CONVERSATION_SUMMARY_DLQ_QUEUE,
  buildSummaryPrompt,
  fetchOrgThreadExport,
  safeParseJsonFromOllama,
  callOllama,
  normalizeResult,
  sanitizeWorkerErrorMessage,
};
