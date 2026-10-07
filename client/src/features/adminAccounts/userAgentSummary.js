const BROWSER_RULES = [
  ['Edge', /\bEdg(?:e|A|iOS)?\/\d/i],
  ['Opera', /\b(?:OPR|Opera)\/\d/i],
  ['Samsung Internet', /\bSamsungBrowser\/\d/i],
  ['Firefox', /\b(?:Firefox|FxiOS)\/\d/i],
  ['Chrome', /\b(?:Chrome|CriOS)\/\d/i],
  ['Safari', /\bVersion\/\d[\d.]*.*\bSafari\/\d/i],
];

const OS_RULES = [
  ['iOS', /\b(?:iPhone|iPad|iPod)\b/i],
  ['Android', /\bAndroid\b/i],
  ['Windows', /\bWindows\b/i],
  ['macOS', /\bMac OS X\b|\bMacintosh\b/i],
  ['ChromeOS', /\bCrOS\b/i],
  ['Linux', /\bLinux\b/i],
];

const MAX_UA_LENGTH = 512;

function matchFirst(rules, ua) {
  for (const [label, pattern] of rules) {
    if (pattern.test(ua)) return label;
  }
  return '';
}

/**
 * Rút gọn User-Agent thành "Trình duyệt · Hệ điều hành" để hiển thị; không trả chuỗi thô.
 * @param {unknown} userAgent
 * @returns {string} '' nếu không nhận diện được
 */
export function summarizeUserAgent(userAgent) {
  if (typeof userAgent !== 'string') return '';
  const ua = userAgent.slice(0, MAX_UA_LENGTH);
  if (!ua.trim()) return '';
  const browser = matchFirst(BROWSER_RULES, ua);
  const os = matchFirst(OS_RULES, ua);
  return [browser, os].filter(Boolean).join(' · ');
}
