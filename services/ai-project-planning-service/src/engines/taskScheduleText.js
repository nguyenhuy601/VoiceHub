/**
 * Per-task timing rows from CPM facts — deterministic text only (no LLM).
 * Hours/order come from sequencing + schedule capacity; this module only phrases them.
 */

const { buildTaskTimingFacts } = require('./taskScheduleTiming');

function clip(value, max = 240) {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  if (!text) return '';
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

function formatHours(value) {
  const hours = Number(value);
  if (!Number.isFinite(hours) || hours < 0) return null;
  const rounded = Math.round(hours * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function peerTitles(rows, max = 2) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => clip(row?.title || row?.id, 40))
    .filter(Boolean)
    .slice(0, max);
}

/**
 * Build one short timeText from numeric CPM facts (locale vi|en).
 */
function buildTimeTextFromFact(fact, locale = 'vi') {
  const en = String(locale || 'vi').toLowerCase() === 'en';
  const parts = [];
  const hours = formatHours(fact?.durationHours);
  if (hours != null) {
    parts.push(en ? `${hours}h` : `${hours} giờ`);
  }

  const parallel = peerTitles(fact?.parallelWith);
  if (parallel.length) {
    parts.push(
      en
        ? `parallel with ${parallel.join(', ')}`
        : `thực hiện song song với ${parallel.join(', ')}`
    );
  } else if ((fact?.predecessors || []).length) {
    parts.push(en ? 'sequential after predecessors' : 'tuần tự sau predecessor');
  }

  if (fact?.critical === true) {
    parts.push(en ? 'on the critical path' : 'nằm trên đường găng');
  }

  const floatHours = formatHours(fact?.totalFloatHours);
  if (fact?.critical !== true && floatHours != null && Number(floatHours) > 0) {
    parts.push(en ? `float ${floatHours}h` : `float ${floatHours} giờ`);
  }

  return clip(parts.join('; '));
}

function timingsFromFacts(facts, locale = 'vi') {
  return (Array.isArray(facts) ? facts : [])
    .map((fact) => {
      const timeText = buildTimeTextFromFact(fact, locale);
      if (!timeText) return null;
      return {
        taskId: fact.id,
        title: fact.title,
        timeText,
        durationHours: fact.durationHours,
        esHours: fact.esHours,
        efHours: fact.efHours,
        totalFloatHours: fact.totalFloatHours,
        critical: fact.critical,
        wave: fact.wave,
        textSource: 'template',
      };
    })
    .filter(Boolean);
}

/** @deprecated LLM accept path removed — kept for tests/callers that pass raw items. */
function acceptTimingTexts(raw, facts, locale = 'vi') {
  const allow = new Set((facts || []).map((fact) => fact.id));
  const textById = new Map();
  for (const row of Array.isArray(raw?.items) ? raw.items : []) {
    const id = String(row?.id || row?.taskId || '').trim();
    if (!allow.has(id) || textById.has(id)) continue;
    const timeText = clip(row?.timeText || row?.text);
    if (timeText) textById.set(id, timeText);
  }
  if (!textById.size) return timingsFromFacts(facts, locale);
  return (facts || []).flatMap((fact) => {
    const timeText = textById.get(fact.id) || buildTimeTextFromFact(fact, locale);
    if (!timeText) return [];
    return [
      {
        taskId: fact.id,
        title: fact.title,
        timeText,
        durationHours: fact.durationHours,
        esHours: fact.esHours,
        efHours: fact.efHours,
        totalFloatHours: fact.totalFloatHours,
        critical: fact.critical,
        wave: fact.wave,
        textSource: textById.has(fact.id) ? 'provided' : 'template',
      },
    ];
  });
}

/**
 * @returns {Promise<{ timings: object[], container: object, meta: object }>}
 */
async function attachTaskTimingTexts({ container, pack = {} } = {}) {
  const facts = buildTaskTimingFacts(container);
  const locale = String(
    pack?.aiAnalysis?.deriveLocale || pack?.locale || process.env.PHASE1_DERIVE_LOCALE || 'vi'
  )
    .trim()
    .toLowerCase();
  const timings = timingsFromFacts(facts, locale === 'en' ? 'en' : 'vi');
  return {
    timings,
    meta: {
      source: 'cpm_template',
      llmCalls: 0,
      fallbackReason: null,
      taskCount: timings.length,
    },
    container: {
      ...container,
      planning: {
        ...(container?.planning || {}),
        taskTimings: timings,
      },
    },
  };
}

module.exports = {
  acceptTimingTexts,
  attachTaskTimingTexts,
  buildTimeTextFromFact,
  timingsFromFacts,
};
