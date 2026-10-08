const { runSourceIngestEngine } = require('./engineHelpers');

function run(input = {}) {
  return runSourceIngestEngine({
    engineId: 'interface',
    section: 'interfaces',
    packKeys: ['interfaces'],
    prefix: 'IF',
    input,
    mapRow: (row, i) => ({
      logicalId: row.logicalId || row.id || `IF-${i + 1}`,
      title: row.title || row.name || `Interface ${i + 1}`,
      description: row.description || '',
      direction: row.direction || null,
      protocol: row.protocol || null,
      sourceRefs: row.sourceRefs || [],
    }),
  });
}

module.exports = { id: 'interface', section: 'interfaces', run };
