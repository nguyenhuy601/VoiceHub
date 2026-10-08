/**
 * Mask common PII before sending prompts to remote LLM; restore after response.
 * Email, VN phone patterns only — does not invent name dictionaries.
 */

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
/** VN mobile: 0xxxxxxxxx or +84... */
const PHONE_RE = /(?:\+?84|0)(?:3|5|7|8|9)\d{8}\b/g;

/**
 * @param {string} text
 * @returns {{ text: string, tokens: Map<string, string> }}
 */
function maskPromptPrivacy(text) {
  const raw = String(text || '');
  const tokens = new Map();
  let n = 0;

  function replaceMatch(match) {
    const key = `__VH_PII_${n}__`;
    n += 1;
    tokens.set(key, match);
    return key;
  }

  let out = raw.replace(EMAIL_RE, replaceMatch);
  out = out.replace(PHONE_RE, replaceMatch);
  return { text: out, tokens };
}

/**
 * @param {string} text
 * @param {Map<string, string>|Record<string, string>} tokens
 */
function unmaskPromptPrivacy(text, tokens) {
  let out = String(text || '');
  const entries =
    tokens instanceof Map
      ? [...tokens.entries()]
      : Object.entries(tokens || {});
  // Longer keys first so nested indices do not collide.
  entries.sort((a, b) => b[0].length - a[0].length);
  for (const [key, value] of entries) {
    out = out.split(key).join(value);
  }
  return out;
}

module.exports = {
  maskPromptPrivacy,
  unmaskPromptPrivacy,
};
