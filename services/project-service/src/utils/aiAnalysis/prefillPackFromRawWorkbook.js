/**
 * Prefill RequirementPack sheets from Customer Requirement Raw xlsx buffer.
 * Only fills empty fields / appends new FR ids — does not wipe existing sheets.
 */

const {
  parseCustomerRawContext,
} = require('../requirement/customerRawContextParse');
const { parseRequirementWorkbook } = require('../requirement/requirementTemplateParse');
const { normId, normProse } = require('../requirement/requirementTemplateTextNorm');

function mergeOverview(existing = {}, fromRaw = {}) {
  const next = { ...(existing || {}) };
  const map = {
    requirementName: fromRaw.projectName || fromRaw.requirementName,
    projectObjective: fromRaw.projectObjective,
    businessScope: fromRaw.businessScope || fromRaw.businessDescription,
    expectedUsers: fromRaw.targetUsers || fromRaw.expectedUsers,
    expectedScale: fromRaw.expectedScale,
    platform: fromRaw.targetPlatform || fromRaw.platform,
    priority: fromRaw.priority,
    deadline: fromRaw.deadline,
    budget: fromRaw.budget,
  };
  for (const [key, value] of Object.entries(map)) {
    const v = normProse(value || '');
    if (!v) continue;
    if (!String(next[key] || '').trim()) next[key] = v;
  }
  return next;
}

function mergeByExternalId(existingList, incomingList) {
  const list = Array.isArray(existingList) ? existingList.map((r) => ({ ...r })) : [];
  const byId = new Map(list.map((r) => [normId(r.externalId || r.externalKey), r]));
  for (const row of Array.isArray(incomingList) ? incomingList : []) {
    const id = normId(row.externalId || row.externalKey);
    if (!id) continue;
    if (byId.has(id)) continue;
    list.push({ ...row });
    byId.set(id, row);
  }
  return list;
}

/**
 * @param {object} pack — plain pack object
 * @param {Buffer} buffer
 * @param {{ filename?: string }} opts
 * @returns {{ pack: object, meta: { applied: boolean, source: string, reason?: string } }}
 */
function prefillPackFromRawWorkbook(packInput, buffer, opts = {}) {
  const pack = packInput && typeof packInput === 'object' ? { ...packInput } : {};
  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    return { pack, meta: { applied: false, source: 'none', reason: 'empty_buffer' } };
  }

  // Prefer full requirement workbook parse when sheets exist; else Customer Raw context-only.
  let parsed = null;
  let source = 'requirement_workbook';
  try {
    parsed = parseRequirementWorkbook(buffer);
    const frCount = Array.isArray(parsed?.functionalRequirements)
      ? parsed.functionalRequirements.length
      : 0;
    const hasOverview = Boolean(
      parsed?.overview &&
        (parsed.overview.projectObjective ||
          parsed.overview.requirementName ||
          parsed.overview.businessScope)
    );
    if (!frCount && !hasOverview) {
      parsed = null;
    }
  } catch {
    parsed = null;
  }

  if (!parsed) {
    try {
      const raw = parseCustomerRawContext(buffer);
      if (!raw?.isCustomerRaw && !raw?.context) {
        return { pack, meta: { applied: false, source: 'none', reason: 'not_customer_raw' } };
      }
      const ctx = raw.context || {};
      pack.overview = mergeOverview(pack.overview, ctx);
      if (
        (!Array.isArray(pack.scope) || !pack.scope.length) &&
        (ctx.inScope || ctx.outOfScope || ctx.businessScope)
      ) {
        const scope = [];
        if (ctx.inScope) scope.push({ type: 'in', scopeType: 'in', description: ctx.inScope });
        if (ctx.outOfScope) {
          scope.push({ type: 'out', scopeType: 'out', description: ctx.outOfScope });
        }
        if (!scope.length && ctx.businessScope) {
          scope.push({ type: 'in', scopeType: 'in', description: ctx.businessScope });
        }
        pack.scope = scope;
      }
      return {
        pack,
        meta: {
          applied: true,
          source: 'customer_raw_context',
          filename: opts.filename,
        },
      };
    } catch (err) {
      return {
        pack,
        meta: {
          applied: false,
          source: 'none',
          reason: String(err.message || 'parse_fail').slice(0, 120),
        },
      };
    }
  }

  pack.overview = mergeOverview(pack.overview, parsed.overview || {});
  if ((!Array.isArray(pack.scope) || !pack.scope.length) && Array.isArray(parsed.scope)) {
    pack.scope = parsed.scope;
  } else if (Array.isArray(parsed.scope) && Array.isArray(pack.scope)) {
    // append missing descriptions
    const have = new Set(pack.scope.map((s) => normProse(s.description || '').toLowerCase()));
    for (const row of parsed.scope) {
      const d = normProse(row.description || '');
      if (d && !have.has(d.toLowerCase())) pack.scope.push(row);
    }
  }

  pack.functionalRequirements = mergeByExternalId(
    pack.functionalRequirements,
    parsed.functionalRequirements
  );
  pack.nonFunctionalRequirements = mergeByExternalId(
    pack.nonFunctionalRequirements || pack.nfrs,
    parsed.nonFunctionalRequirements || parsed.nfrs
  );
  pack.businessGoals = mergeByExternalId(pack.businessGoals, parsed.businessGoals);
  pack.businessRules = mergeByExternalId(pack.businessRules, parsed.businessRules);
  pack.businessProcesses = mergeByExternalId(pack.businessProcesses, parsed.businessProcesses);
  pack.useCases = mergeByExternalId(pack.useCases, parsed.useCases);

  return {
    pack,
    meta: { applied: true, source, filename: opts.filename },
  };
}

module.exports = {
  prefillPackFromRawWorkbook,
  mergeOverview,
  mergeByExternalId,
};
