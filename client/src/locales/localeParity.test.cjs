/**
 * Parity khóa lá vi/en cho các namespace suite + cấm dấu tiếng Việt trong en.
 * Suite Giao tiếp không có root `communicate` — chuỗi nằm ở chat, friends, friendChat, voiceRoom, notifications.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const BUILD = pathToFileURL(path.join(__dirname, 'buildStrings.js')).href;
const GLOSSARY = pathToFileURL(path.join(__dirname, 'productGlossary.js')).href;

const VI_CHARS =
  /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i;

/** Roots bắt buộc có cả vi và en. */
const PARITY_ROOTS = [
  'adminDomains',
  'workspace',
  'company',
  'requirements',
  'common',
  'chat',
  'friends',
  'friendChat',
  'voiceRoom',
  'notifications',
  'login',
  'header',
  'nav',
  'approvals',
  'documents',
  'calendar',
  'settingsPage',
  'dashboard',
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

function setPath(obj, dotted, value) {
  const parts = dotted.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i += 1) {
    cur = cur[parts[i]];
    if (!cur || typeof cur !== 'object') return false;
  }
  const leaf = parts[parts.length - 1];
  if (!(leaf in cur)) return false;
  cur[leaf] = value;
  return true;
}

describe('locale parity', () => {
  it('suite roots share vi and en leaf keys', async () => {
    const { STRINGS } = await import(BUILD);
    const report = {};
    for (const root of PARITY_ROOTS) {
      const viNode = STRINGS.vi[root];
      const enNode = STRINGS.en[root];
      assert.ok(viNode, `missing vi.${root}`);
      assert.ok(enNode, `missing en.${root}`);
      const viKeys = leafPaths(viNode, root).sort();
      const enKeys = leafPaths(enNode, root).sort();
      const missingEn = viKeys.filter((k) => !enKeys.includes(k));
      const missingVi = enKeys.filter((k) => !viKeys.includes(k));
      if (missingEn.length || missingVi.length) {
        report[root] = {
          missingEn: missingEn.slice(0, 20),
          missingVi: missingVi.slice(0, 20),
          missingEnCount: missingEn.length,
          missingViCount: missingVi.length,
        };
      }
    }
    assert.deepEqual(report, {}, 'leaf key mismatch');
  });

  it('en strings in suite roots have no Vietnamese diacritics', async () => {
    const { STRINGS } = await import(BUILD);
    const bad = [];
    for (const root of PARITY_ROOTS) {
      const leaves = collectStringLeaves(STRINGS.en[root], root);
      for (const leaf of leaves) {
        if (VI_CHARS.test(leaf.value)) bad.push(leaf);
        if (bad.length >= 25) break;
      }
      if (bad.length >= 25) break;
    }
    assert.deepEqual(bad, [], 'en must not contain Vietnamese diacritics');
  });

  it('en translator does not fall back to Vietnamese', async () => {
    const { STRINGS, createTranslator } = await import(BUILD);
    const probe = 'common.cancel';
    const viValue = STRINGS.vi.common.cancel;
    const enValue = STRINGS.en.common.cancel;
    assert.equal(typeof viValue, 'string');
    assert.equal(typeof enValue, 'string');
    assert.notEqual(viValue, enValue);

    const removed = setPath(STRINGS.en, probe, undefined);
    assert.equal(removed, true);
    try {
      const t = createTranslator('en');
      assert.equal(t(probe), probe);
      assert.notEqual(t(probe), viValue);
    } finally {
      setPath(STRINGS.en, probe, enValue);
    }
  });

  it('product glossary keeps Scrum terms', async () => {
    const { PRODUCT_VI_WHITELIST } = await import(GLOSSARY);
    for (const term of ['Sprint', 'Backlog', 'Epic', 'Story', 'Kanban', 'WBS']) {
      assert.ok(PRODUCT_VI_WHITELIST.includes(term), term);
    }
  });
});
