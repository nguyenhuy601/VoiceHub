/**
 * In-memory FactStore for tool pipeline (logical; adapter may persist subset).
 */

function createFactStore(initialFacts = []) {
  const byKey = new Map();
  const byTool = new Map();
  const inputHashes = new Map();

  function putFacts(facts, { tool, inputHash } = {}) {
    const list = Array.isArray(facts) ? facts : [];
    for (const fact of list) {
      if (!fact || !fact.key) continue;
      byKey.set(fact.key, fact);
      const t = fact.source?.tool || tool || 'unknown';
      if (!byTool.has(t)) byTool.set(t, []);
      byTool.get(t).push(fact);
    }
    if (tool && inputHash) {
      inputHashes.set(String(tool), String(inputHash));
    }
  }

  function get(key) {
    return byKey.get(String(key)) || null;
  }

  function has(key) {
    return byKey.has(String(key));
  }

  function hasAll(keys) {
    return (keys || []).every((k) => byKey.has(String(k)));
  }

  function list() {
    return [...byKey.values()];
  }

  function toObject() {
    const facts = {};
    for (const [k, v] of byKey.entries()) {
      facts[k] = v.value;
    }
    return {
      facts,
      factEntries: list(),
      inputHashes: Object.fromEntries(inputHashes.entries()),
    };
  }

  if (initialFacts.length) putFacts(initialFacts);

  return {
    putFacts,
    get,
    has,
    hasAll,
    list,
    toObject,
    get inputHashes() {
      return inputHashes;
    },
  };
}

module.exports = { createFactStore };
