/**
 * AI Analysis snapshot pipeline — feature flag + version pins.
 * Bump PIPELINE_VERSION / SKILL_CATALOG_VERSION when maps or projection contracts change.
 */

const PIPELINE_VERSION = 2;

/** Skill catalog pin when Skill Registry is off — bump when whitelist maps change. */
const SKILL_CATALOG_VERSION = 'cap-whitelist-v2';

/**
 * Default ON. Set AI_ANALYSIS_SNAPSHOT_PIPELINE=0 to rollback to live pack/pool.
 */
function isSnapshotPipelineEnabled() {
  const v = String(process.env.AI_ANALYSIS_SNAPSHOT_PIPELINE ?? '1')
    .trim()
    .toLowerCase();
  return v !== '0' && v !== 'false' && v !== 'off' && v !== 'no';
}

module.exports = {
  PIPELINE_VERSION,
  SKILL_CATALOG_VERSION,
  isSnapshotPipelineEnabled,
};
