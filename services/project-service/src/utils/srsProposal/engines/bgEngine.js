const { runSourceIngestEngine } = require('./engineHelpers');

function run(input = {}) {
  return runSourceIngestEngine({
    engineId: 'bg',
    section: 'businessGoals',
    packKeys: ['businessGoals', 'goals'],
    prefix: 'BG',
    input,
    mapRow: (row, i) => ({
      logicalId: row.logicalId || row.id || `BG-${i + 1}`,
      title: row.title || row.name || row.goal || `Goal ${i + 1}`,
      description: row.description || '',
      priority: row.priority || null,
      sourceRefs: row.sourceRefs || [],
    }),
  });
}

module.exports = { id: 'bg', section: 'businessGoals', run };
