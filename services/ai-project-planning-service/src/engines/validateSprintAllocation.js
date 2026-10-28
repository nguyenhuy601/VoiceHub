/**
 * Post-expand validation — never mutates allocation. Issues are for LLM repair / PM.
 */

const { VALIDATION_STATUS } = require('../howSecs/sprint/sprintSchema');

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function roundHours(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function dateKey(value) {
  const match = String(value || '').trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function checkResult(id, result, detail = null) {
  return { id, result, detail };
}

/**
 * @param {object} input
 * @param {object} input.expanded — from expandSprintAssignment
 * @param {object} input.facts — buildSprintFacts (+ evidence flags)
 * @param {object[]} [input.inventIssues]
 */
function validateSprintAllocation({ expanded = {}, facts = {}, inventIssues = [] } = {}) {
  const checks = [];
  const issues = [...asArray(inventIssues)];
  const sprints = asArray(expanded.sprints);
  const pbis = asArray(facts.pbis);
  const pbiById = new Map(pbis.map((p) => [String(p.id), p]));
  const edges = asArray(facts.edges);
  const capacityEvidence = facts.capacityEvidence || (facts.capacity ? 'present' : 'missing');
  const dependencyEvidence = facts.dependencyEvidence || 'not_analyzed';

  // 1. Existence & story link (expand already checked allow; verify task membership)
  let existenceOk = issues.filter((i) =>
    ['pbi_not_in_allow', 'sprint_id_not_in_allow'].includes(i.code)
  ).length === 0;
  for (const sprint of sprints) {
    for (const pbiId of asArray(sprint.pbiIds)) {
      const pbi = pbiById.get(String(pbiId));
      if (!pbi) {
        existenceOk = false;
        issues.push({
          code: 'pbi_not_in_allow',
          sprintId: String(sprint.id),
          pbiId: String(pbiId),
          message: `PBI ${pbiId} không tồn tại trong facts`,
        });
        continue;
      }
      const leafIds = new Set(asArray(pbi.tasks).map((t) => String(t.id)));
      for (const taskId of asArray(sprint.taskIds)) {
        // only check tasks that belong to this pbi's expansion set membership globally later
        if (leafIds.size && !leafIds.has(String(taskId))) {
          // task may belong to another pbi in same sprint — skip cross noise
        }
      }
      const expected = asArray(pbi.tasks).map((t) => String(t.id));
      const present = new Set(asArray(sprint.taskIds).map(String));
      const missingLeaves = expected.filter((id) => !present.has(id));
      if (missingLeaves.length) {
        existenceOk = false;
        issues.push({
          code: 'story_incomplete_scope',
          sprintId: String(sprint.id),
          pbiId: String(pbiId),
          message: `Story ${pbiId} thiếu task lá trong Sprint: ${missingLeaves.slice(0, 5).join(', ')}`,
        });
      }
    }
  }
  checks.push(checkResult('existence_story_link', existenceOk ? 'pass' : 'fail'));

  // 2. Duplicate task across sprints
  const taskOwner = new Map();
  let dupOk = true;
  for (const sprint of sprints) {
    for (const taskId of asArray(sprint.taskIds).map(String)) {
      if (!taskId) continue;
      if (taskOwner.has(taskId)) {
        dupOk = false;
        issues.push({
          code: 'duplicate_task',
          sprintId: String(sprint.id),
          taskId,
          message: `Task ${taskId} nằm ở nhiều Sprint (${taskOwner.get(taskId)} và ${sprint.id})`,
        });
      } else {
        taskOwner.set(taskId, String(sprint.id));
      }
    }
  }
  checks.push(checkResult('no_duplicate_task', dupOk ? 'pass' : 'fail'));

  // 3. Effort consistency
  let effortOk = true;
  for (const sprint of sprints) {
    let sum = 0;
    const seen = new Set();
    for (const pbiId of asArray(sprint.pbiIds)) {
      const pbi = pbiById.get(String(pbiId));
      if (!pbi) continue;
      for (const task of asArray(pbi.tasks)) {
        const tid = String(task.id);
        if (seen.has(tid)) continue;
        seen.add(tid);
        const h = Number(task.effortHours);
        if (Number.isFinite(h) && h > 0) sum += h;
      }
    }
    sum = roundHours(sum);
    const reported = roundHours(sprint.effortHours);
    if (Math.abs(sum - reported) > 0.05) {
      effortOk = false;
      issues.push({
        code: 'effort_mismatch',
        sprintId: String(sprint.id),
        message: `Tổng effort task (${sum}h) khác effortHours Sprint (${reported}h)`,
      });
    }
  }
  checks.push(checkResult('effort_consistency', effortOk ? 'pass' : 'fail'));

  // 4. Capacity
  let capacityCheck = 'pass';
  if (capacityEvidence === 'missing' || capacityEvidence === 'unverified') {
    // Soft: allow draft_ready; Gate2 shows capacity_unverified warn (not hard block).
    capacityCheck = 'pass_unverified';
    issues.push({
      code: 'capacity_unverified',
      message:
        'Capacity đội chưa xác nhận — phân bổ draft; utilization chưa verify cứng.',
    });
  } else {
    for (const sprint of sprints) {
      const cap =
        sprint.capacityHours != null && Number(sprint.capacityHours) > 0
          ? Number(sprint.capacityHours)
          : null;
      if (cap == null) {
        if (capacityCheck !== 'fail') capacityCheck = 'pass_unverified';
        issues.push({
          code: 'capacity_unverified',
          sprintId: String(sprint.id),
          message: `Sprint ${sprint.id} chưa có capacityHours đã xác nhận`,
        });
        continue;
      }
      if (Number(sprint.effortHours) > cap) {
        capacityCheck = 'fail';
        const over = roundHours(Number(sprint.effortHours) - cap);
        issues.push({
          code: 'over_capacity',
          sprintId: String(sprint.id),
          overByHours: over,
          message: `Sprint ${sprint.id} vượt capacity ${over} giờ`,
        });
      }
      // Optional byRole demand vs supply (proportional hint)
      const byRole = asArray(facts.capacity?.byRole);
      if (byRole.length) {
        const demandByRole = new Map();
        for (const pbiId of asArray(sprint.pbiIds)) {
          const pbi = pbiById.get(String(pbiId));
          for (const task of asArray(pbi?.tasks)) {
            const role = String(task.suggestedRoleKey || task.roleKey || '').trim() || 'unassigned';
            const h = Number(task.effortHours) || 0;
            demandByRole.set(role, roundHours((demandByRole.get(role) || 0) + h));
          }
        }
        // Only flag when sprint-level supply hours exist on role and demand exceeds
        // team sprint capacity share — if role has supplyHours on plan, compare roughly
        for (const row of byRole) {
          const role = String(row.roleKey || '').trim();
          if (!role) continue;
          const demand = demandByRole.get(role) || 0;
          const supply = Number(row.supplyHours);
          if (!Number.isFinite(supply) || supply <= 0) continue;
          // Scale: role supply for one sprint ≈ supply / sprintCount if multiple
          const sprintCount = Math.max(1, sprints.length);
          const sprintSupply = supply / sprintCount;
          if (demand > sprintSupply + 0.05) {
            capacityCheck = capacityCheck === 'skipped_insufficient_data' ? capacityCheck : 'fail';
            const over = roundHours(demand - sprintSupply);
            issues.push({
              code: 'over_capacity_role',
              sprintId: String(sprint.id),
              roleKey: role,
              overByHours: over,
              message: `Sprint ${sprint.id} vượt capacity ${role} ${over} giờ`,
            });
          }
        }
      }
    }
  }
  checks.push(checkResult('capacity', capacityCheck));

  // 5. Dependency
  let depCheck = 'pass';
  if (dependencyEvidence === 'not_analyzed') {
    depCheck = 'skipped_insufficient_data';
    issues.push({
      code: 'insufficient_dependency_evidence',
      message: 'Chưa phân tích dependency — không thể xác nhận thứ tự Sprint',
    });
  } else if (dependencyEvidence === 'analyzed_empty') {
    depCheck = 'pass';
  } else {
    const sprintIndex = new Map(sprints.map((s, i) => [String(s.id), i]));
    const taskSprint = new Map();
    sprints.forEach((s, i) => {
      for (const tid of asArray(s.taskIds).map(String)) taskSprint.set(tid, { id: String(s.id), index: i });
    });
    // PBI-level: if any leaf of successor is before predecessor
    for (const edge of edges) {
      const pred = String(edge.predecessorTaskId || '').trim();
      const succ = String(edge.successorTaskId || '').trim();
      if (!pred || !succ) continue;
      const predPl = taskSprint.get(pred);
      const succPl = taskSprint.get(succ);
      if (!predPl || !succPl) continue;
      if (succPl.index < predPl.index) {
        depCheck = 'fail';
        const succPbi = pbis.find((p) => asArray(p.tasks).some((t) => String(t.id) === succ));
        const predPbi = pbis.find((p) => asArray(p.tasks).some((t) => String(t.id) === pred));
        issues.push({
          code: 'dependency_order',
          sprintId: succPl.id,
          pbiId: succPbi?.id || null,
          dependsOn: predPbi?.id || pred,
          message: `Story ${succPbi?.id || succ} phụ thuộc ${predPbi?.id || pred} nhưng đang được xếp trước`,
        });
      } else if (succPl.index === predPl.index) {
        // Same sprint: check due dates if present
        const predTask = pbis.flatMap((p) => p.tasks || []).find((t) => String(t.id) === pred);
        const succTask = pbis.flatMap((p) => p.tasks || []).find((t) => String(t.id) === succ);
        const predDue = dateKey(predTask?.dueDate || predTask?.ef);
        const succDue = dateKey(succTask?.dueDate || succTask?.ef);
        const depType = String(edge.depType || edge.type || 'FS').toUpperCase();
        if (predDue && succDue && (depType === 'FS' || depType === 'FF') && succDue < predDue) {
          depCheck = 'fail';
          issues.push({
            code: 'dependency_order',
            sprintId: succPl.id,
            message: `Trong cùng Sprint, task ${succ} hoàn thành trước predecessor ${pred} (${depType})`,
          });
        }
      }
    }
  }
  checks.push(checkResult('dependency', depCheck));

  // 6. Story time-in-sprint — only enforce when task due/ef dates exist.
  // No dates at all: pass as unverified (do not block whole plan as insufficient_data).
  let timeCheck = 'pass';
  let sawDue = false;
  for (const sprint of sprints) {
    const end = dateKey(sprint.endDate);
    if (!end) continue;
    for (const pbiId of asArray(sprint.pbiIds)) {
      const pbi = pbiById.get(String(pbiId));
      for (const task of asArray(pbi?.tasks)) {
        const due = dateKey(task.dueDate) || dateKey(task.ef);
        if (!due) continue;
        sawDue = true;
        if (due > end) {
          timeCheck = 'fail';
          issues.push({
            code: 'story_incomplete_time',
            sprintId: String(sprint.id),
            pbiId: String(pbiId),
            taskId: String(task.id),
            message: `Task ${task.id} dueDate ${due} sau endDate Sprint ${end}`,
          });
        }
      }
    }
  }
  checks.push(
    checkResult(
      'story_time_in_sprint',
      timeCheck,
      sawDue ? null : 'unverified_no_task_dates'
    )
  );

  // 7. Unallocated reason codes
  const unallocated = asArray(expanded.unallocated);
  const unallocOk = unallocated.every((row) => row && row.reasonCode);
  if (!unallocOk) {
    issues.push({
      code: 'not_ready',
      message: 'Có mục unallocated thiếu reasonCode',
    });
  }
  checks.push(checkResult('unallocated_reason_codes', unallocOk ? 'pass' : 'fail'));

  const hasFail = checks.some((c) => c.result === 'fail') || issues.some((i) =>
    ['over_capacity', 'over_capacity_role', 'dependency_order', 'duplicate_task', 'effort_mismatch', 'story_incomplete_time', 'story_incomplete_scope', 'duplicate_pbi', 'pbi_not_in_allow', 'sprint_id_not_in_allow'].includes(i.code)
  );
  const hasInsufficient = checks.some((c) => c.result === 'skipped_insufficient_data');

  let status = VALIDATION_STATUS.VALIDATED;
  if (hasFail) status = VALIDATION_STATUS.INVALID;
  else if (hasInsufficient) status = VALIDATION_STATUS.INSUFFICIENT_DATA;

  return {
    status,
    checks,
    issues,
    meta: {
      capacityEvidence,
      dependencyEvidence,
      issueCount: issues.length,
    },
  };
}

module.exports = { validateSprintAllocation };
