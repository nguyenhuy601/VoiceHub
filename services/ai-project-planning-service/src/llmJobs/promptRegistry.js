/**
 * jobType → promptVersion / schemaVersion metadata.
 * Handlers must reuse existing propose/build prompt functions (RULE §6.0.5).
 */

const { JOB_TYPES } = require('./llmJobContract');

const REGISTRY = Object.freeze({
  [JOB_TYPES.WBS_CHUNK]: {
    promptVersion: 'wbs-chunk-v1',
    schemaVersion: 'wbs-task-v1',
  },
  [JOB_TYPES.HOW_RISK]: {
    promptVersion: 'how-risk-v1',
    schemaVersion: 'how-risk-v1',
  },
  [JOB_TYPES.HOW_QUALITY]: {
    promptVersion: 'how-quality-v1',
    schemaVersion: 'how-quality-v1',
  },
  [JOB_TYPES.HOW_DEPENDENCY]: {
    promptVersion: 'how-dependency-v1',
    schemaVersion: 'how-dependency-v1',
  },
  [JOB_TYPES.WHAT_SECTION_DERIVE]: {
    promptVersion: 'what-section-derive-v1',
    schemaVersion: 'what-section-v1',
  },
  [JOB_TYPES.WHAT_FR_SEMANTIC]: {
    promptVersion: 'what-fr-semantic-v1',
    schemaVersion: 'what-fr-v1',
  },
  [JOB_TYPES.WHAT_FR_CONFLICT]: {
    promptVersion: 'what-fr-conflict-v1',
    schemaVersion: 'what-fr-v1',
  },
  [JOB_TYPES.WHAT_FR_SYNTHESIS]: {
    promptVersion: 'what-fr-synthesis-v1',
    schemaVersion: 'what-fr-v1',
  },
});

function getPromptMeta(jobType) {
  return REGISTRY[jobType] || { promptVersion: 'unknown', schemaVersion: 'unknown' };
}

module.exports = {
  REGISTRY,
  getPromptMeta,
};
