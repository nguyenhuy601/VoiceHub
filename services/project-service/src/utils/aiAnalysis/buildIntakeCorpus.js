/**
 * Build capped intake corpus from CustomerDocument list + buffer loader.
 */

const {
  isIntakeCorpusEnabled,
  extractCustomerDocumentText,
} = require('./extractCustomerDocumentText');

const TOTAL_MAX_CHARS = 24_000;

const DOC_CLASS_PRIORITY = Object.freeze({
  customer_raw: 0,
  customer_file: 1,
  requirement_xlsx: 2,
  reference_attachment: 3,
  other: 9,
});

function sortDocsForCorpus(docs) {
  return [...(docs || [])].sort((a, b) => {
    const pa = DOC_CLASS_PRIORITY[String(a.docClass || 'other')] ?? 9;
    const pb = DOC_CLASS_PRIORITY[String(b.docClass || 'other')] ?? 9;
    if (pa !== pb) return pa - pb;
    return String(a.filename || '').localeCompare(String(b.filename || ''));
  });
}

/**
 * @param {object[]} documents — lean CustomerDocument rows
 * @param {{ getBuffer: (storageKey: string) => Promise<Buffer>, extractFn?: Function }} deps
 */
async function buildIntakeCorpus(documents, deps = {}) {
  const started = Date.now();
  if (!isIntakeCorpusEnabled()) {
    return {
      schemaVersion: 'intakeCorpus.v1',
      excerpts: [],
      totalChars: 0,
      skipped: [{ reason: 'WHAT_INTAKE_CORPUS_off' }],
      builtAt: new Date().toISOString(),
      durationMs: 0,
    };
  }

  const getBuffer =
    typeof deps.getBuffer === 'function'
      ? deps.getBuffer
      : async (storageKey) => {
          const objectStorage = require('../common/objectStorage');
          if (!objectStorage.isEnabled()) {
            const err = new Error('object_storage_disabled');
            err.code = 'object_storage_disabled';
            throw err;
          }
          return objectStorage.getObjectBuffer(storageKey);
        };

  const extractFn = deps.extractFn || extractCustomerDocumentText;
  const sorted = sortDocsForCorpus(documents);
  const excerpts = [];
  const skipped = [];
  let totalChars = 0;

  for (const doc of sorted) {
    if (totalChars >= TOTAL_MAX_CHARS) {
      skipped.push({
        filename: doc.filename,
        reason: 'corpus_cap_reached',
      });
      continue;
    }
    const storageKey = String(doc.storageKey || '').trim();
    const filename = String(doc.filename || 'file').slice(0, 260);
    if (!storageKey || storageKey.startsWith('pending/')) {
      skipped.push({ filename, reason: 'no_storage_key' });
      continue;
    }

    let buffer;
    try {
      buffer = await getBuffer(storageKey);
    } catch (err) {
      skipped.push({
        filename,
        reason: `get_failed:${String(err.code || err.message || 'error').slice(0, 80)}`,
      });
      continue;
    }

    const result = await extractFn(buffer, {
      filename,
      mimeType: doc.mimeType,
    });
    const text = String(result?.text || '').trim();
    if (!text) {
      skipped.push({
        filename,
        reason: result?.skipped || 'empty_extract',
      });
      continue;
    }

    const room = TOTAL_MAX_CHARS - totalChars;
    const excerpt = text.length > room ? `${text.slice(0, Math.max(0, room - 1))}…` : text;
    excerpts.push({
      documentId: doc._id ? String(doc._id) : doc.documentId || undefined,
      filename,
      docClass: doc.docClass || undefined,
      chars: excerpt.length,
      text: excerpt,
      method: result.method || undefined,
    });
    totalChars += excerpt.length;
  }

  return {
    schemaVersion: 'intakeCorpus.v1',
    excerpts,
    totalChars,
    skipped,
    builtAt: new Date().toISOString(),
    durationMs: Math.max(0, Date.now() - started),
  };
}

/**
 * Flat text block — for future WHAT prompt inject only.
 * Do not write into overview.businessScope (schema maxlength 4000).
 */
function formatIntakeCorpusBlock(corpus) {
  if (!corpus || !Array.isArray(corpus.excerpts) || !corpus.excerpts.length) return '';
  const parts = corpus.excerpts.map(
    (ex) => `### ${ex.filename}\n${ex.text}`
  );
  return `--- INTAKE_CORPUS ---\n${parts.join('\n\n')}\n--- END_INTAKE_CORPUS ---`;
}

/** Default prompt inject budget (chars) — separate from storage TOTAL_MAX_CHARS. */
const DEFAULT_WHAT_INTAKE_PROMPT_MAX_CHARS = 8000;

/**
 * Prompt budget from WHAT_INTAKE_PROMPT_MAX_CHARS (default 8000; 0 = off).
 * Also off when WHAT_INTAKE_CORPUS is disabled.
 */
function resolveWhatIntakePromptMaxChars() {
  if (!isIntakeCorpusEnabled()) return 0;
  const raw = String(process.env.WHAT_INTAKE_PROMPT_MAX_CHARS ?? '').trim();
  if (raw === '') return DEFAULT_WHAT_INTAKE_PROMPT_MAX_CHARS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_WHAT_INTAKE_PROMPT_MAX_CHARS;
  return Math.floor(n);
}

function resolveCorpusFromSource(source) {
  if (!source || typeof source !== 'object') return null;
  if (Array.isArray(source.excerpts)) return source;
  const nested = source.aiAnalysis?.intakeCorpus || source.intakeCorpus;
  if (nested && typeof nested === 'object') return nested;
  return null;
}

/**
 * Capped INTAKE_CORPUS block for WHAT LLM prompts.
 * @param {object} source — corpus `{ excerpts }` or pack `{ aiAnalysis: { intakeCorpus } }`
 * @param {{ maxChars?: number }} [opts]
 * @returns {string} empty when disabled/empty; otherwise length <= maxChars
 */
function buildWhatIntakePromptBlock(source, opts = {}) {
  const maxChars =
    opts.maxChars != null && Number.isFinite(Number(opts.maxChars))
      ? Math.floor(Number(opts.maxChars))
      : resolveWhatIntakePromptMaxChars();
  if (maxChars <= 0) return '';

  const corpus = resolveCorpusFromSource(source);
  if (!corpus || !Array.isArray(corpus.excerpts) || !corpus.excerpts.length) return '';

  const header = '--- INTAKE_CORPUS ---\n';
  const footer = '\n--- END_INTAKE_CORPUS ---';
  const overhead = header.length + footer.length;
  if (overhead >= maxChars) return '';

  let room = maxChars - overhead;
  const parts = [];
  for (const ex of corpus.excerpts) {
    if (room <= 0) break;
    const filename = String(ex.filename || 'file').slice(0, 260);
    const text = String(ex.text || '');
    const prefix = parts.length ? `\n\n### ${filename}\n` : `### ${filename}\n`;
    if (prefix.length >= room) break;
    const textRoom = room - prefix.length;
    const body =
      text.length > textRoom
        ? `${text.slice(0, Math.max(0, textRoom - 1))}…`
        : text;
    if (!body && textRoom < 1) break;
    parts.push(`${prefix}${body}`);
    room -= prefix.length + body.length;
  }
  if (!parts.length) return '';
  return `${header}${parts.join('')}${footer}`;
}

module.exports = {
  TOTAL_MAX_CHARS,
  DEFAULT_WHAT_INTAKE_PROMPT_MAX_CHARS,
  DOC_CLASS_PRIORITY,
  sortDocsForCorpus,
  buildIntakeCorpus,
  formatIntakeCorpusBlock,
  resolveWhatIntakePromptMaxChars,
  buildWhatIntakePromptBlock,
};
