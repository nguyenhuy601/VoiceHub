const { runSourceIngestEngine } = require('./engineHelpers');

function run(input = {}) {
  return runSourceIngestEngine({
    engineId: 'br',
    section: 'businessRules',
    packKeys: ['businessRules'],
    prefix: 'BR',
    input,
    mapRow: (row, i) => ({
      logicalId: row.logicalId || row.id || `BR-${i + 1}`,
      title: row.title || row.name || `Rule ${i + 1}`,
      description: row.description || row.text || '',
      sourceRole: row.sourceRole || 'business_rule',
      sourceRefs: row.sourceRefs || [],
    }),
  });
}

module.exports = { id: 'br', section: 'businessRules', run };
