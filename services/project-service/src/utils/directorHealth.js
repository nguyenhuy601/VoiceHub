/**
 * Pure director project-health aggregates (Phase 6 Wave A).
 */

function resolveDueDate(project) {
  return project?.dueDate || project?.expectedEndDate || null;
}

/**
 * @returns {'completed'|'delayed'|'on_track'}
 */
function classifyProjectHealth(project, asOf = new Date()) {
  const p = project || {};
  const status = String(p.status || '').toLowerCase();
  if (p.isActive === false || status === 'closed') return 'completed';
  const due = resolveDueDate(p);
  if (due) {
    const dueMs = new Date(due).getTime();
    if (Number.isFinite(dueMs) && dueMs < asOf.getTime()) return 'delayed';
  }
  return 'on_track';
}

function aggregateDirectorHealth(projects = [], asOf = new Date()) {
  const counts = { delayed: 0, onTrack: 0, completed: 0, total: 0 };
  const rows = [];
  for (const p of projects || []) {
    counts.total += 1;
    const health = classifyProjectHealth(p, asOf);
    if (health === 'delayed') counts.delayed += 1;
    else if (health === 'completed') counts.completed += 1;
    else counts.onTrack += 1;
    rows.push({
      projectId: String(p._id || p.projectId || ''),
      title: String(p.title || ''),
      status: String(p.status || ''),
      isActive: p.isActive !== false,
      dueDate: resolveDueDate(p),
      health,
      budgetStub: p.budgetStub || null,
    });
  }
  return {
    asOf: asOf.toISOString(),
    counts,
    projects: rows,
    budget: {
      enabled: false,
      note: 'Budget accounting ERP out of scope — placeholder only',
    },
  };
}

module.exports = {
  resolveDueDate,
  classifyProjectHealth,
  aggregateDirectorHealth,
};
