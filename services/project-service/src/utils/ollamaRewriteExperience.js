const axios = require('axios');

const TIMEOUT_MS = 3000;

function provider() {
  return String(process.env.LLM_PROVIDER || 'ollama').trim().toLowerCase();
}

/**
 * Diễn đạt lại factLine; cấm thêm số. Fail/timeout/mock → giữ nguyên work.
 * @param {Array<{ userId: string, work: string }>} items
 */
async function rewriteExperienceLines(items) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return list;
  if (provider() === 'mock') return list;

  const baseUrl = String(process.env.OLLAMA_BASE_URL || '').trim().replace(/\/+$/, '');
  if (!baseUrl) return list;

  const payload = list.map((it) => ({
    userId: String(it.userId),
    factLine: String(it.work || ''),
  }));

  const prompt = [
    'Rewrite each factLine into one Vietnamese sentence (max 300 chars).',
    'Do NOT add numbers, dates, percents, or facts missing from factLine.',
    'Return JSON array: [{"userId":"...","work":"..."}]',
    JSON.stringify(payload),
  ].join('\n');

  try {
    const model = process.env.OLLAMA_MODEL || 'qwen2.5:3b-instruct';
    const res = await axios.post(
      `${baseUrl}/api/generate`,
      {
        model,
        prompt,
        stream: false,
        options: { temperature: 0.1 },
      },
      { timeout: TIMEOUT_MS, validateStatus: () => true }
    );
    if (!res || res.status < 200 || res.status >= 300) return list;
    const text = String(res.data?.response || res.data || '');
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    if (start < 0 || end <= start) return list;
    const parsed = JSON.parse(text.slice(start, end + 1));
    if (!Array.isArray(parsed)) return list;
    const byId = new Map(
      parsed
        .filter((r) => r && r.userId)
        .map((r) => [String(r.userId), String(r.work || '').trim().slice(0, 300)])
    );
    return list.map((it) => {
      const next = byId.get(String(it.userId));
      if (!next) return it;
      return { ...it, work: next };
    });
  } catch {
    return list;
  }
}

module.exports = {
  rewriteExperienceLines,
};
