/**
 * Enrich planning run input with G1 catalogs (in-process, RULE-11 / RULE-G1-MEM).
 * In-memory only — does not mutate immutable PlanningRun.input.
 */

const { attachG1Catalogs } = require('./attachG1Catalogs');

/**
 * @param {object} run — lean PlanningRun
 * @returns {Promise<{ run: object, snapshot: object, g1Warnings: object[] }>}
 */
async function enrichRunInputWithG1Catalogs(run) {
  const input =
    run?.input && typeof run.input === 'object' ? { ...run.input } : {};
  const rawSnapshot = input.snapshot || input.snapshotPayload || null;

  // Slim WHAT/HOW starts (RULE-DL-07) have no embedded snapshot/pack.
  // Do NOT invent input.snapshot here — that forces hydrate into embedded_legacy
  // with an empty pack and skips Customer Raw derive (BG/scope).
  if (!rawSnapshot || typeof rawSnapshot !== 'object') {
    return {
      run,
      snapshot: null,
      g1Warnings: [],
      g1Catalogs: null,
    };
  }

  const attachInput = {
    ...rawSnapshot,
    pack: input.pack || rawSnapshot.pack,
    staffingPlan:
      rawSnapshot.staffingPlan ||
      input.pack?.staffingPlan ||
      rawSnapshot.pack?.staffingPlan,
    requirementSkills:
      rawSnapshot.requirementSkills ||
      input.pack?.requirementSkills ||
      rawSnapshot.pack?.requirementSkills,
  };

  const { snapshot, g1Warnings, g1Catalogs } = attachG1Catalogs(attachInput);

  const nextInput = {
    ...input,
    snapshot,
    snapshotPayload: snapshot,
    g1Catalogs,
    g1Warnings,
  };

  return {
    run: { ...run, input: nextInput },
    snapshot,
    g1Warnings,
    g1Catalogs,
  };
}

module.exports = { enrichRunInputWithG1Catalogs };
