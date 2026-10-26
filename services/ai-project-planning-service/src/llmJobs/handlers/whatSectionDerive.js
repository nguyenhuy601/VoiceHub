/**
 * what.section.derive — reuses proposeSectionJson path (no new prompt).
 */

const { JOB_TYPES } = require('../llmJobContract');

async function handleWhatSectionDerive(job, opts = {}) {
  const payload = job.payload || {};
  const engineId = String(payload.engineId || '').trim();
  if (!engineId) {
    const err = new Error('what_section_engine_required');
    err.code = 'WHAT_SECTION_ENGINE_REQUIRED';
    throw err;
  }

  if (typeof opts.invokeFn === 'function') {
    const out = await opts.invokeFn({
      engineId,
      contextRef: job.contextRef,
      factsRef: job.factsRef,
      payload,
      generateJsonFn: opts.generateJsonFn,
    });
    return out;
  }

  const { loadContextPackage } = require('../graph/persistContextPackage');
  const ctx = loadContextPackage(job.contextRef, opts.env || process.env);
  const { proposeSectionJson } = require('../../semantic/runRawSectionDerive');

  const bundle = payload.bundle || ctx?.bundle || null;
  if (!bundle) {
    return {
      ok: true,
      engineId,
      items: Array.isArray(payload.items) ? payload.items : [],
      stub: true,
      annotation: 'llm_proposal',
    };
  }

  const proposed = await proposeSectionJson(bundle, opts.generateJsonFn || opts.invokeFn);
  return {
    ok: true,
    engineId,
    section: bundle.section || payload.section || null,
    items: proposed?.items || proposed?.rows || [],
    raw: proposed,
    annotation: 'llm_proposal',
  };
}

handleWhatSectionDerive.jobType = JOB_TYPES.WHAT_SECTION_DERIVE;

module.exports = { handleWhatSectionDerive };
