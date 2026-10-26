/**
 * WBS semantic slim — FR ids cited on Gate1 stories plus G4 capability/intent.
 */

const {
  normalizeDeriveLocale,
  languageInstruction,
} = require('../semantic/buildSemanticDeriveContext');

function clip(value, max) {
  const t = String(value ?? '').trim();
  if (!max || t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

/**
 * Semantic slim for WBS — FR ids cited on Gate1 stories + G4 capability/intent.
 * Does not invent FR units or pull full SRS pack into the prompt path.
 *
 * @param {{
 *   stories?: object[],
 *   pack?: object,
 *   env?: NodeJS.ProcessEnv,
 * }} opts
 */
async function buildWbsSemanticFromStories(opts = {}) {
  const pack = opts.pack || {};
  const env = opts.env || process.env;
  const {
    assembleHowToolContext,
    slimLayer,
    contextAllowsWork,
    missingSlotsFor,
  } = require('../semanticLayer/howToolContext');
  const locale = normalizeDeriveLocale(
    pack?.aiAnalysis?.deriveLocale || pack?.locale || env.PHASE1_DERIVE_LOCALE
  );
  const layer = await assembleHowToolContext({
    ...opts,
    purpose: 'WBS_GENERATION',
    pack,
    stories: opts.stories,
  });
  const frs = layer.ok ? layer.requiredData?.functionalRequirements || [] : [];
  const notes = new Map();
  for (const annotation of layer.annotations || []) {
    const id = String(annotation?.subjectRef?.entityId || '').trim();
    if (!id) continue;
    const prev = notes.get(id) || {};
    if (annotation.annotationType === 'capability' || annotation.annotationType === 'intent') {
      prev[annotation.annotationType] = annotation.value;
      notes.set(id, prev);
    }
  }
  const cited = new Set();
  for (const story of layer.ok ? layer.requiredData?.story || [] : []) {
    for (const id of story.sourceFrIds || []) cited.add(id);
  }
  const fr = frs
    .filter((row) => !cited.size || cited.has(row.id))
    .map((row) => {
      const inferred = notes.get(row.id) || {};
      const ac = Array.isArray(row.ac)
        ? row.ac.map((line) => clip(line, 360)).filter(Boolean).slice(0, 24)
        : [];
      const out = {
        id: row.id,
        capability: inferred.capability || undefined,
        intent: inferred.intent || undefined,
        module: row.module || undefined,
        feature: row.feature || undefined,
        statement: row.statement || undefined,
        ac: ac.length ? ac : undefined,
      };
      for (const key of Object.keys(out)) {
        if (out[key] == null || out[key] === '') delete out[key];
      }
      return out;
    });
  const missingSlots = layer.ok ? missingSlotsFor('WBS_GENERATION', layer) : [layer.code || 'CONTEXT_REJECTED'];
  return {
    ok: contextAllowsWork(layer) && !missingSlots.length,
    contextStatus: layer.status || layer.code || null,
    missingSlots,
    semantic: {
      business: {
        locale,
        languageInstruction: languageInstruction(locale),
        projectName: clip(pack.overview?.name || pack.name || pack.overview?.requirementName, 80),
      },
      approved: { fr },
      layer: slimLayer(layer),
    },
  };
}

module.exports = {
  buildWbsSemanticFromStories,
};
