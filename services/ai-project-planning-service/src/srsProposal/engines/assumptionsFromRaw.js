/**
 * Deterministic assumptions from Customer Raw (canonical constraints / overview).
 * No LLM — fills Gate1 assumptions when Analysis sheet is absent.
 */

const { stampDerived } = require('../../semantic/stampProvenance');

function asArray(v) {
  return Array.isArray(v) ? v : [];
}

function splitAssumptionText(text) {
  return String(text || '')
    .split(/[;\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 8);
}

function pushUnique(map, text, meta = {}) {
  const clean = String(text || '').trim();
  if (clean.length < 8) return;
  const key = clean.toLowerCase();
  if (map.has(key)) return;
  map.set(key, { text: clean, ...meta });
}

/**
 * @param {object} pack
 * @param {{ snapshot?: object }} [opts]
 * @returns {{ items: object[], coverage: object }}
 */
function buildAssumptionsFromRaw(pack, opts = {}) {
  const canonicalRaw =
    opts.snapshot?.canonicalRaw || pack?.aiAnalysis?.canonicalRaw || null;
  const byText = new Map();

  // 1) Pack sheet (if any)
  for (const row of asArray(pack?.assumptions)) {
    pushUnique(byText, row.assumption || row.text || row.title || row.description, {
      classification: 'ASSUMPTION',
      source: 'pack_sheet',
    });
  }

  // 2) Overview.assumption
  const ov = pack?.overview || {};
  for (const part of splitAssumptionText(ov.assumption || ov.assumptions)) {
    pushUnique(byText, part, { classification: 'ASSUMPTION', source: 'overview' });
  }

  // 3) Canonical constraints.assumption (primary Customer Raw SoT)
  const constraints = canonicalRaw?.constraints || {};
  for (const part of splitAssumptionText(constraints.assumption)) {
    pushUnique(byText, part, { classification: 'ASSUMPTION', source: 'canonical_constraints' });
  }
  if (constraints.business_constraint) {
    pushUnique(byText, constraints.business_constraint, {
      classification: 'ASSUMPTION',
      source: 'canonical_business_constraint',
    });
  }
  if (constraints.platform_constraint) {
    pushUnique(byText, `Nền tảng: ${constraints.platform_constraint}`, {
      classification: 'ASSUMPTION',
      source: 'canonical_platform_constraint',
    });
  }

  // 4) Scope-out as phase boundary assumptions (soft)
  const scopeOut = asArray(canonicalRaw?.content?.scopeOut || canonicalRaw?.content?.scope_out);
  for (const s of scopeOut.slice(0, 3)) {
    pushUnique(byText, `Ngoài phạm vi giai đoạn 1: ${s}`, {
      classification: 'ASSUMPTION',
      source: 'canonical_scope_out',
    });
  }

  // 5) Business scope sentence with "Không gồm..."
  const scopeText = String(ov.businessScope || '');
  const m = scopeText.match(/Không gồm[^.]+\.?/i);
  if (m) {
    pushUnique(byText, m[0].trim(), {
      classification: 'ASSUMPTION',
      source: 'overview_scope_exclusion',
    });
  }

  const items = [...byText.values()].slice(0, 12).map((row, i) =>
    stampDerived(
      {
        logicalId: `ASM-${i + 1}`,
        title: String(row.text).slice(0, 240),
        description: String(row.text),
        classification: row.classification || 'ASSUMPTION',
        sourceRefs: row.source
          ? [{ externalId: row.source, sheet: '00_Context' }]
          : [],
      },
      {
        engineId: 'assumption',
        section: 'assumptions',
        rule: 'RAW_ASSUMPTIONS_DETERMINISTIC',
        index: i,
        defaultPrefix: 'ASM',
      }
    )
  );

  return {
    items,
    coverage: {
      status: items.length ? 'AVAILABLE' : 'NO_DATA',
      reason: items.length ? null : 'DERIVE_EMPTY',
      sourceStats: {
        sourceRows: byText.size,
        mappedRows: items.length,
        orphanRows: 0,
      },
    },
  };
}

module.exports = {
  buildAssumptionsFromRaw,
  splitAssumptionText,
};
