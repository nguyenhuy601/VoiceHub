/**
 * Job-specific filters — after common filter.
 */

function scoreHotFr(row) {
  let score = 0;
  const desc = String(row.description || '');
  const ac = String(row.acceptanceCriteria || row.ac || '');
  if (desc.length < 20) score += 40;
  if (ac.length < 15) score += 40;
  if (desc.length > 120) score += 15;
  score += Math.min(20, String(row.moduleLabel || row.module || '').length / 4);
  return score;
}

function filterWhatJobs(base, job) {
  const frAll = (base.fr || []).filter(
    (r) => String(r.level || '') === 'Requirement' || !r.level
  );
  const ranked = [...frAll].sort(
    (a, b) =>
      scoreHotFr(b) - scoreHotFr(a) ||
      String(a.externalId || '').localeCompare(String(b.externalId || ''))
  );
  const hot = ranked.slice(0, 80);
  const hotIds = new Set(hot.map((r) => r.externalId));
  const frSlices = (base.frSlices || []).filter((s) => hotIds.has(s.id) || !hotIds.size);
  const nfr = (base.nonFunctionalRequirements || []).slice(0, 50);

  return {
    ...base,
    fr: hot,
    frSlices: frSlices.length ? frSlices : (base.frSlices || []).slice(0, 80),
    nonFunctionalRequirements: nfr,
    employees: undefined,
    filterMeta: {
      job,
      focus: ['hot_fr', 'relevant_nfr'],
      frKept: hot.length,
      frTotal: frAll.length,
    },
  };
}

/**
 * @param {string} job
 * @param {object} commonFiltered
 */
function applyJobFilter(job, commonFiltered = {}) {
  const key = String(job || '').trim();
  const base = commonFiltered;

  if (
    key === 'hierarchyDecomposition' ||
    key === 'requirementAnalysis' ||
    key === 'capabilityAnalysis' ||
    key === 'requirementInsights' ||
    key === 'wbsGeneration' ||
    key === 'dependencyAnalysis' ||
    key === 'architectureRiskAnalysis'
  ) {
    return filterWhatJobs(base, key);
  }

  if (key === 'employeeMatching') {
    const requiredSkills = [...(base.merged?.requiredSkillIds || [])];
    const requiredRoles = [...(base.merged?.requiredRoleIds || [])];
    const requiredSet = new Set(requiredSkills);
    let employees = (base.employees || []).filter((emp) => {
      if (emp.isActive === false) return false;
      const avail = String(emp.availability || '').toLowerCase();
      if (avail === 'overallocated') return false;
      const availPct = Number(emp.availablePct ?? emp.workload?.availablePct);
      if (Number.isFinite(availPct) && availPct <= 0) return false;
      return true;
    });

    if (requiredSet.size) {
      const withOverlap = employees.filter((emp) => {
        const ids = emp.skillCanonicalIds || [];
        if (ids.some((id) => requiredSet.has(id))) return true;
        const names = (emp.skills || emp.capability?.skills || []).map((s) =>
          String(typeof s === 'string' ? s : s.name || '').toLowerCase()
        );
        // Soft fallback: keep if any skill name present when canonical ids missing
        return !ids.length && names.length > 0;
      });
      if (withOverlap.length) employees = withOverlap;
    }

    return {
      ...base,
      employees,
      filterMeta: {
        job: key,
        requiredSkillIds: requiredSkills,
        requiredRoleIds: requiredRoles,
        focus: ['skill', 'role', 'capacity', 'availability'],
        employeeKept: employees.length,
        emptyPoolReason:
          employees.length === 0 && requiredSet.size
            ? 'no_skill_overlap_or_capacity'
            : undefined,
      },
    };
  }

  if (key === 'effortRoleAnalysis') {
    const fr = (base.fr || []).filter((r) => {
      if (String(r.level || '') !== 'Requirement' && r.level) return false;
      const hasEstimate = r.estimateHours != null && Number(r.estimateHours) > 0;
      const hasComplexity =
        String(r.description || '').length >= 20 || String(r.acceptanceCriteria || '').length >= 15;
      return hasEstimate || hasComplexity;
    });
    return {
      ...base,
      fr,
      filterMeta: {
        job: key,
        focus: ['similar_task', 'actual_effort', 'complexity'],
        frKept: fr.length,
      },
    };
  }

  if (key === 'scheduleCapacity' || key === 'projectPlan') {
    return {
      ...base,
      employees: (base.employees || []).filter((e) => e.isActive !== false),
      filterMeta: {
        job: key,
        focus: ['calendar', 'workload', 'working_hours'],
        hasCalendar: Boolean(
          base.calendar?.workingCalendar &&
            Object.keys(base.calendar.workingCalendar || {}).length
        ),
        holidayCount: Array.isArray(base.calendar?.holidays)
          ? base.calendar.holidays.length
          : 0,
      },
    };
  }

  if (key === 'sequencingCpm') {
    return {
      ...base,
      filterMeta: { job: key, focus: ['dependencies', 'sequence'] },
    };
  }

  return {
    ...base,
    filterMeta: { job: key || 'unknown', focus: ['srs'] },
  };
}

/** Slim prepared artifact for snapshot persist (ids + counts, not full blobs). */
function buildPreparedByJobSummary(commonFiltered = {}) {
  const jobs = [
    'hierarchyDecomposition',
    'requirementAnalysis',
    'capabilityAnalysis',
    'requirementInsights',
    'wbsGeneration',
    'dependencyAnalysis',
    'architectureRiskAnalysis',
    'effortRoleAnalysis',
    'sequencingCpm',
    'employeeMatching',
    'scheduleCapacity',
    'projectPlan',
  ];
  const out = {};
  for (const job of jobs) {
    const filtered = applyJobFilter(job, commonFiltered);
    out[job] = {
      filterMeta: filtered.filterMeta || {},
      frIds: (filtered.fr || []).map((r) => r.externalId).filter(Boolean).slice(0, 200),
      employeeIds: (filtered.employees || [])
        .map((e) => e.employeeId || e.userId)
        .filter(Boolean)
        .slice(0, 200),
      nfrCount: (filtered.nonFunctionalRequirements || []).length,
    };
  }
  return out;
}

const WHAT_JOBS_NO_EMPLOYEES = new Set([
  'hierarchyDecomposition',
  'requirementAnalysis',
  'capabilityAnalysis',
  'requirementInsights',
  'wbsGeneration',
  'dependencyAnalysis',
  'architectureRiskAnalysis',
]);

/**
 * Hydrate jobFiltered from commonFiltered using preparedByJob[job] id pins (SoT).
 * Preserves prepared frIds / employeeIds order.
 */
function materializePreparedJob(commonFiltered = {}, preparedSummary = null, job = '') {
  const key = String(job || '').trim();
  const summary = preparedSummary && typeof preparedSummary === 'object' ? preparedSummary : null;
  if (!summary) return null;

  const frIds = Array.isArray(summary.frIds) ? summary.frIds.map(String) : [];
  const employeeIds = Array.isArray(summary.employeeIds) ? summary.employeeIds.map(String) : [];
  const frById = new Map(
    (commonFiltered.fr || [])
      .map((r) => [String(r.externalId || '').trim(), r])
      .filter(([id]) => id)
  );
  const fr = frIds.map((id) => frById.get(id)).filter(Boolean);
  const frIdSet = new Set(fr.map((r) => String(r.externalId || '').trim()));
  const frSlices = (commonFiltered.frSlices || []).filter(
    (s) => !frIdSet.size || frIdSet.has(String(s.id || '').trim())
  );

  const nfrAll = commonFiltered.nonFunctionalRequirements || [];
  const nfrCount =
    summary.nfrCount != null && Number.isFinite(Number(summary.nfrCount))
      ? Number(summary.nfrCount)
      : nfrAll.length;
  const nonFunctionalRequirements = nfrAll.slice(0, Math.max(0, nfrCount));

  let employees;
  if (WHAT_JOBS_NO_EMPLOYEES.has(key)) {
    employees = undefined;
  } else if (employeeIds.length) {
    const empById = new Map();
    for (const e of commonFiltered.employees || []) {
      const id = String(e.employeeId || e.userId || '').trim();
      if (id) empById.set(id, e);
    }
    employees = employeeIds.map((id) => empById.get(id)).filter(Boolean);
  } else {
    employees = commonFiltered.employees || [];
  }

  return {
    ...commonFiltered,
    fr,
    frSlices: frSlices.length ? frSlices : (commonFiltered.frSlices || []).slice(0, 80),
    nonFunctionalRequirements,
    employees,
    filterMeta: {
      ...(summary.filterMeta || {}),
      job: key || summary.filterMeta?.job,
      materializedFromPrepared: true,
      frKept: fr.length,
      employeeKept: Array.isArray(employees) ? employees.length : undefined,
    },
  };
}

module.exports = {
  applyJobFilter,
  buildPreparedByJobSummary,
  materializePreparedJob,
  scoreHotFr,
};
