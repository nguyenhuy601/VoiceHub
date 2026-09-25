/**
 * G7 retrieve step — stub / off substring match (Step 3).
 * keyword|hybrid → retrieveKeyword / retrieveHybrid (Step 4).
 * qdrant → still uses this path with fallbackStub until Step 5.
 */

const SNIPPET_MAX = 200;

function docText(doc) {
  return String(doc?.text || doc?.content || doc?.title || '');
}

function docSourceId(doc, index) {
  return String(doc?.id || doc?.sourceId || `doc-${index}`);
}

/**
 * @param {{ query?: string, corpus?: object[], mode?: string }} args
 * @returns {{ docs: object[], modeUsed: string, fallbackStub: boolean }}
 */
function retrieveStub({ query = '', corpus = [], mode = 'stub' } = {}) {
  const list = Array.isArray(corpus) ? corpus : [];
  const q = String(query || '').trim();

  if (mode === 'off') {
    return { docs: [], modeUsed: 'off', fallbackStub: false };
  }

  // Only qdrant still falls back here until Step 5; keyword/hybrid use their own modules
  const fallbackStub = mode === 'qdrant';
  const modeUsed = fallbackStub ? 'qdrant' : 'stub';

  const matched = list
    .map((doc, i) => ({
      doc,
      index: i,
      sourceId: docSourceId(doc, i),
      text: docText(doc),
    }))
    .filter(({ text }) => {
      if (!q) return true;
      return text.toLowerCase().includes(q.toLowerCase());
    })
    .map(({ doc, index, sourceId, text }, rank) => ({
      ...doc,
      sourceId,
      id: doc.id || doc.sourceId || sourceId,
      text,
      snippet: text.slice(0, SNIPPET_MAX),
      score: typeof doc.score === 'number' ? doc.score : 1 / (rank + 1),
      _corpusIndex: index,
    }));

  return {
    docs: matched,
    modeUsed,
    fallbackStub,
  };
}

module.exports = {
  retrieveStub,
  docText,
  docSourceId,
  SNIPPET_MAX,
};
