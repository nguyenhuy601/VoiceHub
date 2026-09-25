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

  const attachInput =
    rawSnapshot && typeof rawSnapshot === 'object'
      ? {
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
        }
      : {
          pack: input.pack || null,
          staffingPlan: input.pack?.staffingPlan,
          requirementSkills: input.pack?.requirementSkills,
          projected: input.pack?.projected || undefined,
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
