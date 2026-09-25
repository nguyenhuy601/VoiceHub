/**
 * G7 hybrid retrieve — merge keyword BM25-lite ∪ stub substring (Step 4).
 * No vector / Qdrant. Dedupe by sourceId; keep higher score.
 */

const { retrieveKeyword } = require('./retrieveKeyword');
const { retrieveStub } = require('./retrieveStub');

/**
 * @param {{ query?: string, corpus?: object[], intent?: string }} args
 * @returns {{ docs: object[], modeUsed: 'hybrid' }}
 */
function retrieveHybrid({ query = '', corpus = [], intent = 'general' } = {}) {
  const { docs: keywordDocs } = retrieveKeyword({ query, corpus, intent });
  const { docs: stubDocs } = retrieveStub({ query, corpus, mode: 'stub' });

  const bySource = new Map();

  function merge(doc) {
    const key = String(doc.sourceId || doc.id || '');
    if (!key) return;
    const prev = bySource.get(key);
    if (!prev || (Number(doc.score) || 0) > (Number(prev.score) || 0)) {
      bySource.set(key, doc);
    }
  }

  for (const d of keywordDocs) merge(d);
  for (const d of stubDocs) merge(d);

  const docs = [...bySource.values()].sort(
    (a, b) =>
      (Number(b.score) || 0) - (Number(a.score) || 0) ||
      String(a.sourceId || '').localeCompare(String(b.sourceId || ''))
  );

  return { docs, modeUsed: 'hybrid' };
}

module.exports = { retrieveHybrid };
