/**
 * Map analyses.dependency (HOW LLM status matrix + proposal/schedulable) → Gate2 / flow rows.
 */

function clip(value, max = 160) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

export const DEP_ANALYSIS_STATUS = Object.freeze({
  COMPLETE_NO_EDGES: 'COMPLETE_NO_EDGES',
  DEPENDENCIES_FOUND: 'DEPENDENCIES_FOUND',
  INCOMPLETE: 'INCOMPLETE',
  SKIPPED: 'SKIPPED',
  FAILED: 'FAILED',
  PARTIAL: 'PARTIAL',
  INVALID: 'INVALID',
  SEMANTIC_INCOMPLETE: 'SEMANTIC_INCOMPLETE',
});

export function buildTaskNameMap(container) {
  const tasks = Array.isArray(container?.planning?.tasks) ? container.planning.tasks : [];
  const map = new Map();
  for (const t of tasks) {
    const id = String(t.id || t.taskId || '').trim();
    if (!id) continue;
    map.set(id, String(t.name || t.title || id).trim());
  }
  return map;
}

export function taskLabel(taskById, taskId) {
  const id = String(taskId || '').trim();
  if (!id) return '?';
  const name = taskById.get(id);
  if (!name || name === id) return id;
  return `${name} (${id})`;
}

export function taskShortName(taskById, taskId) {
  const id = String(taskId || '').trim();
  if (!id) return '?';
  return taskById.get(id) || id;
}

/**
 * @param {object} section — analyses.dependency
 */
function pickDependencyFallbackReason(section = {}, meta = {}) {
  const fromMeta = String(meta.fallbackReason || section.fallbackReason || '').trim();
  if (fromMeta) return fromMeta.slice(0, 240);
  const questions = Array.isArray(section.openQuestions)
    ? section.openQuestions
    : Array.isArray(section.unresolvedQuestions)
      ? section.unresolvedQuestions
      : [];
  const failedQ = questions.find(
    (q) => String(q?.code || '').toUpperCase() === 'DEP_LLM_FAILED'
  );
  const msg = String(failedQ?.message || failedQ?.question || '').trim();
  return msg ? msg.slice(0, 240) : '';
}

export function readDependencyAnalysisMeta(section = {}) {
  const meta = section?.meta && typeof section.meta === 'object' ? section.meta : {};
  const analysisStatus = String(
    section.analysisStatus || meta.analysisStatus || ''
  )
    .trim()
    .toUpperCase();
  return {
    analysisStatus: analysisStatus || null,
    executionTerminal: Boolean(
      section.executionTerminal ?? meta.executionTerminal ?? false
    ),
    analysisComplete: Boolean(section.analysisComplete ?? meta.analysisComplete ?? false),
    scheduleReady: Boolean(section.scheduleReady ?? meta.scheduleReady ?? false),
    source: String(meta.source || section.source || '').trim(),
    llmCalls: Number(meta.llmCalls) || 0,
    fallbackReason: pickDependencyFallbackReason(section, meta),
    openQuestions: Array.isArray(section.openQuestions)
      ? section.openQuestions
      : Array.isArray(section.unresolvedQuestions)
        ? section.unresolvedQuestions
        : Array.isArray(meta.openQuestions)
          ? meta.openQuestions
          : [],
  };
}

/**
 * Banner for Monitor / Gate2 when dependency analysis is not a clean edge list.
 */
export function describeDependencyAnalysisBanner(section, t) {
  const { analysisStatus, scheduleReady, analysisComplete, fallbackReason } =
    readDependencyAnalysisMeta(section || {});
  const tr = (key, fallback) => {
    const value = typeof t === 'function' ? t(key) : '';
    return value == null || value === '' || value === key ? fallback : value;
  };

  switch (analysisStatus) {
    case DEP_ANALYSIS_STATUS.SKIPPED:
      return {
        tone: 'warn',
        title: tr('requirements.gate2DepStatus_SKIPPED', 'Phụ thuộc: LLM tắt — chưa phân tích'),
        body: tr(
          'requirements.gate2DepStatusHint_SKIPPED',
          'DependencyTool bị SKIPPED. Schedule không sẵn sàng cho đến khi chạy lại HOW với LLM bật.'
        ),
      };
    case DEP_ANALYSIS_STATUS.FAILED: {
      const base = tr(
        'requirements.gate2DepStatusHint_FAILED',
        'LLM provider lỗi (DashScope/timeout/quota). Không coi là “không có phụ thuộc”. Chạy lại HOW sau khi provider ổn.'
      );
      const detail = fallbackReason
        ? tr(
            'requirements.gate2DepStatusHint_FAILED_detail',
            'Chi tiết: {reason}'
          ).replace('{reason}', fallbackReason)
        : '';
      return {
        tone: 'danger',
        title: tr('requirements.gate2DepStatus_FAILED', 'Phụ thuộc: phân tích thất bại'),
        body: detail ? `${base} ${detail}` : base,
      };
    }
    case DEP_ANALYSIS_STATUS.SEMANTIC_INCOMPLETE:
      return {
        tone: 'warn',
        title: tr(
          'requirements.gate2DepStatus_SEMANTIC_INCOMPLETE',
          'Phụ thuộc: thiếu WBS leaf'
        ),
        body: tr(
          'requirements.gate2DepStatusHint_SEMANTIC_INCOMPLETE',
          'Chưa có task leaf khi chạy DependencyTool. Sửa WBS rồi chạy lại HOW.'
        ),
      };
    case DEP_ANALYSIS_STATUS.INCOMPLETE:
      return {
        tone: 'warn',
        title: tr('requirements.gate2DepStatus_INCOMPLETE', 'Phụ thuộc: thiếu thông tin'),
        body: tr(
          'requirements.gate2DepStatusHint_INCOMPLETE',
          'LLM đã chạy nhưng còn câu hỏi / thiếu bằng chứng. Schedule chưa sẵn sàng.'
        ),
      };
    case DEP_ANALYSIS_STATUS.PARTIAL:
      return {
        tone: 'warn',
        title: tr(
          'requirements.gate2DepStatus_PARTIAL',
          'Phụ thuộc: một phần (proposal ≠ lịch)'
        ),
        body: tr(
          'requirements.gate2DepStatusHint_PARTIAL',
          scheduleReady
            ? 'Có cạnh đưa vào lịch; còn proposal không schedulable (SS/FF/SF, tích hợp, …).'
            : 'Có đề xuất để PM xem nhưng chưa đủ cạnh FS đưa vào lịch.'
        ),
      };
    case DEP_ANALYSIS_STATUS.INVALID:
      return {
        tone: 'danger',
        title: tr('requirements.gate2DepStatus_INVALID', 'Phụ thuộc: không hợp lệ (chu trình)'),
        body: tr(
          'requirements.gate2DepStatusHint_INVALID',
          'Phát hiện chu trình trên cạnh lịch. Proposal giữ để review — không công bố DAG hoàn chỉnh.'
        ),
      };
    case DEP_ANALYSIS_STATUS.COMPLETE_NO_EDGES:
      return {
        tone: 'ok',
        title: tr(
          'requirements.gate2DepStatus_COMPLETE_NO_EDGES',
          'Phụ thuộc: đã phân tích — không có cạnh'
        ),
        body: tr(
          'requirements.gate2DepStatusHint_COMPLETE_NO_EDGES',
          'LLM kết luận không có phụ thuộc hỗ trợ. Schedule có thể chạy với DAG rỗng.'
        ),
      };
    case DEP_ANALYSIS_STATUS.DEPENDENCIES_FOUND:
      return analysisComplete && scheduleReady
        ? null
        : {
            tone: 'ok',
            title: tr(
              'requirements.gate2DepStatus_DEPENDENCIES_FOUND',
              'Phụ thuộc: đã có cạnh lịch'
            ),
            body: null,
          };
    default:
      return null;
  }
}

/**
 * Resolve decision overlay for display status.
 */
export function resolveDependencyDecisionStatus(row, decision) {
  const action = String(decision?.action || '').toLowerCase();
  if (action === 'accept' || action === 'approve' || action === 'confirm') {
    return 'CONFIRMED';
  }
  if (action === 'reject' || action === 'rejected') {
    return 'REJECTED';
  }
  const raw = String(row?.decisionStatus || row?.status || 'PROPOSED').toUpperCase();
  if (raw === 'CRITICAL' || raw === 'READY') {
    return 'PROPOSED';
  }
  if (['PROPOSED', 'CONFIRMED', 'REJECTED'].includes(raw)) return raw;
  return 'PROPOSED';
}

function requiredAtToBlockingScope(requiredAt, dep) {
  if (dep?.blockingScope) return String(dep.blockingScope).toUpperCase();
  const at = String(requiredAt || '').toUpperCase();
  if (at === 'INTEGRATION') return 'INTEGRATION_ONLY';
  if (at === 'TEST_ONLY' || at === 'TEST') return 'TEST_ONLY';
  if (at === 'START' || at === 'NONE') return 'NONE';
  if (dep?.blocking === false) return 'INTEGRATION_ONLY';
  return 'FULL';
}

/**
 * Normalize one proposal/schedulable/legacy edge into display fields.
 */
export function mapDependencyToDisplayFields(dep, index, taskById, opts = {}) {
  const isV2 =
    dep &&
    (dep.predecessorTaskId || dep.successorTaskId || dep.blockingScope || dep.schemaVersion);

  let predecessorTaskId;
  let successorTaskId;
  if (isV2 || dep.predecessorTaskId || dep.successorTaskId) {
    predecessorTaskId = String(dep.predecessorTaskId || dep.to || '').trim();
    successorTaskId = String(dep.successorTaskId || dep.from || '').trim();
  } else {
    predecessorTaskId = String(dep.to || dep.predecessorId || '').trim();
    successorTaskId = String(dep.from || dep.successorId || '').trim();
  }

  const id = String(
    dep.id || dep.edgeId || `${predecessorTaskId}->${successorTaskId}` || `dep-${index}`
  );
  const predName = taskShortName(taskById, predecessorTaskId);
  const succName = taskShortName(taskById, successorTaskId);
  const relationLabel = `${predName} → ${succName}`;

  const requiredOutput = clip(dep.requiredOutput || '', 200);
  const requiredAt = String(dep.requiredAt || '').trim().toUpperCase() || null;
  const basis = String(dep.basis || '').trim().toUpperCase() || null;
  const reason = clip(dep.reason || dep.evidence || requiredOutput || '', 200);
  const title = clip(dep.title || reason || relationLabel, 120);
  const blockingScope = requiredAtToBlockingScope(requiredAt, dep);
  const canWorkInParallel =
    dep.canWorkInParallel === true ||
    blockingScope === 'INTEGRATION_ONLY' ||
    blockingScope === 'TEST_ONLY' ||
    requiredAt === 'INTEGRATION';
  const parallelCondition = clip(dep.parallelCondition || '', 160);
  const relationship = String(
    dep.relationship || dep.depType || dep.type || dep.kind || 'FS'
  ).toUpperCase();
  const decisionStatus = String(dep.status || dep.decisionStatus || 'PROPOSED').toUpperCase();
  const requiredInput =
    dep.requiredInput && typeof dep.requiredInput === 'object' ? dep.requiredInput : null;
  const schedulable =
    opts.schedulable === true ||
    dep.schedulable === true ||
    (opts.forceSchedulable === true && relationship === 'FS' && requiredAt !== 'INTEGRATION');
  const assumptions = Array.isArray(dep.assumptions)
    ? dep.assumptions.map((a) => clip(a, 120)).filter(Boolean)
    : [];

  return {
    id,
    predecessorTaskId,
    successorTaskId,
    predecessorName: predName,
    successorName: succName,
    relationLabel,
    title,
    reason,
    summary: reason || title,
    requiredOutput,
    requiredOutputLabel: requiredOutput || '—',
    requiredAt: requiredAt || (blockingScope === 'INTEGRATION_ONLY' ? 'INTEGRATION' : 'FULL'),
    basis: basis || 'INFERRED',
    assumptions,
    depType: relationship,
    relationship,
    blockingScope,
    canWorkInParallel,
    parallelCondition,
    parallelLabel: canWorkInParallel
      ? parallelCondition || 'Có thể song song'
      : 'Tuần tự (chặn)',
    requiredInput,
    requiredInputLabel: requiredInput
      ? clip(
          `${requiredInput.name || ''}${requiredInput.condition ? `: ${requiredInput.condition}` : ''}`,
          120
        )
      : requiredOutput
        ? clip(requiredOutput, 120)
        : '',
    schedulable: Boolean(schedulable),
    scheduleLabel: schedulable ? 'Đưa vào lịch' : 'Chỉ đề xuất',
    decisionStatus: ['PROPOSED', 'CONFIRMED', 'REJECTED'].includes(decisionStatus)
      ? decisionStatus
      : 'PROPOSED',
    status: decisionStatus === 'REJECTED' ? 'REJECTED' : decisionStatus,
    critical: Boolean(dep.critical) || (blockingScope === 'FULL' && !canWorkInParallel && schedulable),
    source: dep.source || '',
    evidence: Array.isArray(dep.evidence) ? dep.evidence : [],
    evidenceRefs: Array.isArray(dep.evidenceRefs) ? dep.evidenceRefs : [],
  };
}

function edgeKey(dep) {
  const from = String(dep.from || dep.successorTaskId || '').trim();
  const to = String(dep.to || dep.predecessorTaskId || '').trim();
  return `${from}->${to}`;
}

/**
 * Collect display rows — prefer proposalEdges (PM review), mark schedulable from schedulableEdges.
 */
export function listDependencyDisplayItems(container) {
  const taskById = buildTaskNameMap(container);
  const section = container?.analyses?.dependency || {};
  const analysis = readDependencyAnalysisMeta(section);

  const unresolvedQuestions = analysis.openQuestions.map((q) => ({
    ...q,
    question: q.question || q.message || '',
    whyItMatters: q.whyItMatters || q.reason || '',
    taskId: q.taskId || (Array.isArray(q.relatedTaskIds) ? q.relatedTaskIds[0] : ''),
  }));

  const proposalRaw = Array.isArray(section.proposalEdges) ? section.proposalEdges : [];
  const schedulableRaw = Array.isArray(section.schedulableEdges)
    ? section.schedulableEdges
    : Array.isArray(section.edges)
      ? section.edges
      : [];
  const v2 = Array.isArray(section.dependencies) ? section.dependencies : [];
  const schedulableKeys = new Set(schedulableRaw.map(edgeKey).filter((k) => k !== '->'));

  let rawList = [];
  if (proposalRaw.length) {
    rawList = proposalRaw;
  } else if (v2.length) {
    rawList = v2;
  } else if (schedulableRaw.length) {
    rawList = schedulableRaw;
  } else if (Array.isArray(container?.planning?.dependencies)) {
    rawList = container.planning.dependencies;
  }

  const items = rawList.map((dep, i) =>
    mapDependencyToDisplayFields(dep, i, taskById, {
      schedulable:
        dep.schedulable === true ||
        schedulableKeys.has(edgeKey(dep)) ||
        (!proposalRaw.length && schedulableRaw.length > 0),
    })
  );

  return {
    items,
    unresolvedQuestions,
    taskById,
    section,
    analysis,
  };
}
