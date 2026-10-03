/**
 * Deterministic actors + scope fill from Customer Raw pack (no LLM).
 */

const { stampDerived } = require('../../semantic/stampProvenance');
const { buildRawDeriveInput } = require('../../semantic/buildRawDeriveInput');
const { shouldRawDeriveSection } = require('../../semantic/rawSectionDerivePolicy');

function splitUsers(text) {
  return String(text || '')
    .split(/[,;/|]+/)
    .map((s) => s.trim())
    .filter((s) => s && !/^tất cả$/i.test(s));
}

function addActorName(names, raw) {
  for (const part of splitUsers(raw)) {
    const key = part.toLowerCase();
    if (!names.has(key)) names.set(key, part);
  }
}

/**
 * @param {object} pack
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ items: object[], coverage: object }}
 */
function buildActorsFromRaw(pack, env = process.env) {
  if (!shouldRawDeriveSection('actors', pack, env)) {
    return { items: [], coverage: { status: 'NO_DATA', reason: 'RAW_DERIVE_NOT_APPLICABLE' } };
  }
  const input = buildRawDeriveInput('actors', pack);
  const names = new Map();
  for (const fr of input.functionalRequirements || []) {
    addActorName(names, fr.actor || fr.primaryActor || '');
  }
  // Dual-read pack FR when slim input missed actors
  for (const fr of Array.isArray(pack?.functionalRequirements) ? pack.functionalRequirements : []) {
    addActorName(names, fr.actor || fr.primaryActor || fr.userActor || '');
  }
  addActorName(names, input.targetUsers);
  addActorName(names, pack?.overview?.expectedUsers || pack?.overview?.targetUsers || '');
  const items = [...names.values()].map((name, i) =>
    stampDerived(
      {
        logicalId: `ACT-${i + 1}`,
        title: name,
        description: `Actor from Customer Raw (FR User/Actor or Target Users)`,
        sourceRefs: [],
      },
      {
        engineId: 'actors',
        section: 'actors',
        rule: 'RAW_ACTORS_DETERMINISTIC',
        index: i,
        defaultPrefix: 'ACT',
      }
    )
  );
  return {
    items,
    coverage: {
      status: items.length ? 'AVAILABLE' : 'NO_DATA',
      reason: items.length ? null : 'DERIVE_EMPTY',
      sourceStats: { sourceRows: names.size, mappedRows: items.length, orphanRows: 0 },
    },
  };
}

/**
 * Ensure scope items from canonicalRaw Section Input, pack.scope, or overview.
 * @param {object} pack
 * @param {NodeJS.ProcessEnv} [env]
 * @param {{ snapshot?: object }} [opts]
 */
function buildScopeFromRaw(pack, env = process.env, opts = {}) {
  if (!shouldRawDeriveSection('scope', pack, env)) {
    return { items: [], coverage: { status: 'NO_DATA', reason: 'RAW_DERIVE_NOT_APPLICABLE' } };
  }

  // Semantic Contract P1: prefer scope_in / scope_out from canonicalRaw
  const canonicalRaw =
    opts.snapshot?.canonicalRaw
    || pack?.aiAnalysis?.canonicalRaw
    || null;
  if (canonicalRaw) {
    try {
      const { buildSectionInput } = require('../../semantic/sectionInputContract');
      const section = buildSectionInput('scope', canonicalRaw);
      if (section.ok && section.items.length) {
        const items = section.items.map((row, i) => {
          const scopeType = row.type === 'out' ? 'out' : 'in';
          return stampDerived(
            {
              logicalId: `SCOPE-${scopeType.toUpperCase()}-${i + 1}`,
              title: String(row.description || `Scope ${i + 1}`).slice(0, 240),
              description: String(row.description || ''),
              scopeType,
              inScope: scopeType !== 'out',
              sourceRefs: [],
            },
            {
              engineId: 'scope',
              section: 'scope',
              rule: 'RAW_SCOPE_CANONICAL',
              index: i,
              defaultPrefix: 'SCOPE',
            }
          );
        });
        return {
          items,
          coverage: {
            status: 'AVAILABLE',
            reason: null,
            sourceStats: { sourceRows: items.length, mappedRows: items.length, orphanRows: 0 },
          },
        };
      }
    } catch {
      /* dual-read pack.scope */
    }
  }

  if (Array.isArray(pack.scope) && pack.scope.length) {
    const items = pack.scope.map((row, i) =>
      stampDerived(
        {
          logicalId: row.id || row.logicalId || `SCOPE-${i + 1}`,
          title: String(row.description || row.statement || `Scope ${i + 1}`).slice(0, 240),
          description: String(row.description || ''),
          scopeType: row.scopeType || row.type || (row.inScope === false ? 'out' : 'in'),
          inScope: row.inScope !== false && String(row.scopeType || row.type || 'in').toLowerCase() !== 'out',
          sourceRefs: [],
        },
        {
          engineId: 'scope',
          section: 'scope',
          rule: 'RAW_SCOPE_DETERMINISTIC',
          index: i,
          defaultPrefix: 'SCOPE',
        }
      )
    );
    return {
      items,
      coverage: { status: 'AVAILABLE', reason: null, sourceStats: { sourceRows: items.length, mappedRows: items.length, orphanRows: 0 } },
    };
  }

  const input = buildRawDeriveInput('scope', pack, { snapshot: opts.snapshot });
  const items = [];
  const o = input.overview || {};
  if (o.businessScope || o.projectObjective) {
    items.push(
      stampDerived(
        {
          logicalId: 'SCOPE-IN-1',
          title: o.businessScope || o.projectObjective,
          description: o.projectObjective || o.businessScope,
          scopeType: 'in',
          inScope: true,
        },
        {
          engineId: 'scope',
          section: 'scope',
          rule: 'RAW_SCOPE_FROM_CONTEXT',
          index: 0,
          defaultPrefix: 'SCOPE',
        }
      )
    );
  }
  return {
    items,
    coverage: {
      status: items.length ? 'AVAILABLE' : 'NO_DATA',
      reason: items.length ? null : 'DERIVE_EMPTY',
      sourceStats: { sourceRows: 0, mappedRows: items.length, orphanRows: 0 },
    },
  };
}

module.exports = {
  buildActorsFromRaw,
  buildScopeFromRaw,
};
