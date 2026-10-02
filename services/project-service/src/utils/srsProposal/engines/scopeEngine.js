const { runSourceIngestEngine } = require('./engineHelpers');

function run(input = {}) {
  return runSourceIngestEngine({
    engineId: 'scope',
    section: 'scope',
    packKeys: ['scope', 'scopeItems'],
    prefix: 'SCOPE',
    input,
    mapRow: (row, i) => ({
      logicalId: row.logicalId || row.id || `SCOPE-${i + 1}`,
      title: row.title || row.name || `Scope ${i + 1}`,
      inScope: row.inScope !== false && String(row.scopeType || '').toLowerCase() !== 'out',
      description: row.description || row.text || '',
      sourceRefs: row.sourceRefs || [],
    }),
  });
}

module.exports = { id: 'scope', section: 'scope', run };
