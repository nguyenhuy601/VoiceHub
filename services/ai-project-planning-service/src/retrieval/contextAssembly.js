/**
 * G7 Context Assembly stub — query → retrieve → rerank → assemble (in-memory, no Qdrant).
 */

function assembleContextPackage(input = {}) {
  const query = String(input.query || '').trim();
  const corpus = Array.isArray(input.corpus) ? input.corpus : [];

  const retrieved = corpus.filter((doc) => {
    if (!query) return true;
    const text = String(doc.text || doc.content || doc.title || '').toLowerCase();
    return text.includes(query.toLowerCase());
  });

  const reranked = retrieved
    .map((doc, i) => ({
      ...doc,
      score: typeof doc.score === 'number' ? doc.score : 1 / (i + 1),
    }))
    .sort((a, b) => b.score - a.score);

  const citations = reranked.slice(0, input.topK || 5).map((doc, i) => ({
    citationId: `CIT-${i + 1}`,
    sourceId: doc.id || doc.sourceId || `doc-${i}`,
    snippet: String(doc.text || doc.content || '').slice(0, 200),
    score: doc.score,
  }));

  return {
    query,
    citations,
    assembledAt: new Date().toISOString(),
    stub: true,
  };
}

module.exports = { assembleContextPackage };
