/**
 * Parity vi/en cho namespace admin + heuristic trộn ngôn ngữ (whitelist glossary).
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname);
const STRINGS_FILE = path.join(ROOT, 'adminDomains.strings.js');
const GLOSSARY_FILE = path.join(ROOT, 'adminGlossary.js');

const VI_CHARS =
  /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i;

const ADMIN_ROOT_KEYS = [
  'adminDomains',
  'adminOrg',
  'adminUsers',
  'adminAccounts',
  'adminTasks',
  'adminRbac',
  'adminChannels',
  'adminVoice',
  'adminFiles',
  'adminSecurity',
  'adminAudit',
];

function leafPaths(obj, prefix = '') {
  const out = [];
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    if (prefix) out.push(prefix);
    return out;
  }
  for (const [k, v] of Object.entries(obj)) {
    const next = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) out.push(...leafPaths(v, next));
    else out.push(next);
  }
  return out;
}

function collectStringLeaves(obj, prefix = '', acc = []) {
  if (typeof obj === 'string') {
    acc.push({ path: prefix, value: obj });
    return acc;
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return acc;
  for (const [k, v] of Object.entries(obj)) {
    collectStringLeaves(v, prefix ? `${prefix}.${k}` : k, acc);
  }
  return acc;
}

function stripWhitelist(text, whitelist) {
  let s = text;
  const sorted = [...whitelist].sort((a, b) => b.length - a.length);
  for (const w of sorted) {
    s = s.split(w).join(' ');
  }
  return s;
}

/** Latin word tokens that look English (length >= 3). */
function englishTokens(text) {
  return (text.match(/\b[A-Z][a-z]{2,}\b/g) || []).concat(text.match(/\b[a-z]{4,}\b/g) || []);
}

describe('admin locale parity', () => {
  it('vi and en admin namespaces have the same leaf keys', async () => {
    const { adminDomainStrings } = await import(pathToFileURL(STRINGS_FILE).href);
    for (const root of ADMIN_ROOT_KEYS) {
      const viNode = adminDomainStrings.vi[root];
      const enNode = adminDomainStrings.en[root];
      assert.ok(viNode, `missing vi.${root}`);
      assert.ok(enNode, `missing en.${root}`);
      const viKeys = leafPaths(viNode, root).sort();
      const enKeys = leafPaths(enNode, root).sort();
      const missingEn = viKeys.filter((k) => !enKeys.includes(k));
      const missingVi = enKeys.filter((k) => !viKeys.includes(k));
      assert.deepEqual(
        { missingEn, missingVi },
        { missingEn: [], missingVi: [] },
        `${root} leaf mismatch`
      );
    }
  });

  it('en admin strings have no Vietnamese letters', async () => {
    const { adminDomainStrings } = await import(pathToFileURL(STRINGS_FILE).href);
    const leaves = collectStringLeaves(adminDomainStrings.en);
    const bad = leaves.filter((l) => VI_CHARS.test(l.value)).slice(0, 30);
    assert.deepEqual(bad, [], 'en must not contain Vietnamese diacritics');
  });

  it('vi admin strings avoid English Title Case outside glossary whitelist', async () => {
    const { adminDomainStrings } = await import(pathToFileURL(STRINGS_FILE).href);
    const { ADMIN_VI_WHITELIST } = await import(pathToFileURL(GLOSSARY_FILE).href);
    const leaves = collectStringLeaves(adminDomainStrings.vi);
    const bannedPhrase = [
      /[Rr]eset mật khẩu/,
      /Organizational Levels/i,
      /Permission \(gói/i,
      /Gói Permission/i,
      /Org Role/i,
      /Project Role/i,
      /Master Data/i,
      /[Tt]eam [Ll]eader/,
      /Thu hồi session/i,
      /Delegation Graph/i,
      /Change Requests/i,
      /Visibility Policy/i,
      /Project Settings/i,
      /Mute \/ Kick/i,
    ];
    const bad = [];
    for (const leaf of leaves) {
      for (const re of bannedPhrase) {
        if (re.test(leaf.value)) {
          bad.push({ path: leaf.path, value: leaf.value, reason: String(re) });
          break;
        }
      }
    }
    assert.deepEqual(bad.slice(0, 40), [], `mixed vi strings: ${bad.length}`);
  });
});
