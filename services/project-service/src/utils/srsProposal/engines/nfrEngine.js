const { runSourceIngestEngine } = require('./engineHelpers');

function run(input = {}) {
  return runSourceIngestEngine({
    engineId: 'nfr',
    section: 'nonFunctionalRequirements',
    packKeys: ['nonFunctionalRequirements', 'nfrs'],
    prefix: 'NFR',
    input,
    mapRow: (row, i) => ({
      logicalId: row.logicalId || row.id || `NFR-${i + 1}`,
      title: row.title || row.name || `NFR ${i + 1}`,
      category: row.category || 'general',
      description: row.description || '',
      status: row.status || 'EXTRACTED',
      sourceRefs: row.sourceRefs || [],
    }),
  });
}

module.exports = { id: 'nfr', section: 'nonFunctionalRequirements', run };
