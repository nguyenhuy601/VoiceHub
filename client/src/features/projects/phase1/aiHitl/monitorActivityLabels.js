/**
 * Human-readable Monitor activity labels (BA/PO-facing), not raw engine ids.
 */

const TOOL_ACTIVITY = Object.freeze({
  WbsTool: {
    key: 'requirements.aiHitlMonitorActivity_WbsTool',
    fallback: 'Đang lập WBS…',
  },
  DependencyTool: {
    key: 'requirements.aiHitlMonitorActivity_DependencyTool',
    fallback: 'Đang phân tích phụ thuộc…',
  },
  ArchitectureTool: {
    key: 'requirements.aiHitlMonitorActivity_ArchitectureTool',
    fallback: 'Đang đề xuất kiến trúc…',
  },
  RiskTool: {
    key: 'requirements.aiHitlMonitorActivity_RiskTool',
    fallback: 'Đang đánh giá rủi ro…',
  },
  QualityPlanTool: {
    key: 'requirements.aiHitlMonitorActivity_QualityPlanTool',
    fallback: 'Đang lập kế hoạch kiểm thử…',
  },
  EffortTool: {
    key: 'requirements.aiHitlMonitorActivity_EffortTool',
    fallback: 'Đang ước lượng effort…',
  },
  SequencingTool: {
    key: 'requirements.aiHitlMonitorActivity_SequencingTool',
    fallback: 'Đang sắp thứ tự công việc…',
  },
  EmployeeMatchingTool: {
    key: 'requirements.aiHitlMonitorActivity_EmployeeMatchingTool',
    fallback: 'Đang ghép nhân sự…',
  },
  ScheduleTool: {
    key: 'requirements.aiHitlMonitorActivity_ScheduleTool',
    fallback: 'Đang lập lịch…',
  },
  DeployPlanTool: {
    key: 'requirements.aiHitlMonitorActivity_DeployPlanTool',
    fallback: 'Đang lập kế hoạch deploy…',
  },
  BacklogMapTool: {
    key: 'requirements.aiHitlMonitorActivity_BacklogMapTool',
    fallback: 'Đang lập backlog…',
  },
  ProjectPlanTool: {
    key: 'requirements.aiHitlMonitorActivity_ProjectPlanTool',
    fallback: 'Đang tổng hợp project plan…',
  },
  RequirementAnalysisTool: {
    key: 'requirements.aiHitlMonitorActivity_RequirementAnalysisTool',
    fallback: 'Đang phân tích yêu cầu…',
  },
  WhatFrTool: {
    key: 'requirements.aiHitlMonitorActivity_RequirementAnalysisTool',
    fallback: 'Đang phân tích yêu cầu…',
  },
  WhatBGTool: {
    key: 'requirements.aiHitlMonitorActivity_WhatBGTool',
    fallback: 'Đang derive mục tiêu nghiệp vụ…',
  },
  WhatBRTool: {
    key: 'requirements.aiHitlMonitorActivity_WhatBRTool',
    fallback: 'Đang derive quy tắc nghiệp vụ…',
  },
  WhatUCTool: {
    key: 'requirements.aiHitlMonitorActivity_WhatUCTool',
    fallback: 'Đang derive use case…',
  },
  WhatBPMTool: {
    key: 'requirements.aiHitlMonitorActivity_WhatBPMTool',
    fallback: 'Đang derive quy trình…',
  },
  WhatDataTool: {
    key: 'requirements.aiHitlMonitorActivity_WhatDataTool',
    fallback: 'Đang derive thực thể…',
  },
  WhatNFRTool: {
    key: 'requirements.aiHitlMonitorActivity_WhatNFRTool',
    fallback: 'Đang derive NFR…',
  },
  WhatScopeTool: {
    key: 'requirements.aiHitlMonitorActivity_WhatScopeTool',
    fallback: 'Đang derive phạm vi…',
  },
  WhatActorsTool: {
    key: 'requirements.aiHitlMonitorActivity_WhatActorsTool',
    fallback: 'Đang derive tác nhân…',
  },
  // ReAct phase nodes (WHAT/HOW) — keep legacy keys for older runs
  plan: {
    key: 'requirements.aiHitlMonitorActivity_plan',
    fallback: 'Đang lập kế hoạch tool…',
  },
  select: {
    key: 'requirements.aiHitlMonitorActivity_select',
    fallback: 'Đang chọn tool…',
  },
  selectTools: {
    key: 'requirements.aiHitlMonitorActivity_selectTools',
    fallback: 'Đang chọn tools planning…',
  },
  prepareWhat: {
    key: 'requirements.aiHitlMonitorActivity_understand',
    fallback: 'Đang chuẩn bị ngữ cảnh WHAT…',
  },
  prepareHowContext: {
    key: 'requirements.aiHitlMonitorActivity_prepareHowContext',
    fallback: 'Đang chuẩn bị ngữ cảnh HOW…',
  },
  finalizePlan: {
    key: 'requirements.aiHitlMonitorActivity_finalizePlan',
    fallback: 'Đang khóa project plan…',
  },
  feasibility: {
    key: 'requirements.aiHitlMonitorActivity_feasibility',
    fallback: 'Đang kiểm tra feasibility…',
  },
  runFrUnderstanding: {
    key: 'requirements.aiHitlMonitorActivity_RequirementAnalysisTool',
    fallback: 'Đang phân tích yêu cầu…',
  },
  enterTools: {
    key: 'requirements.aiHitlMonitorActivity_enterTools',
    fallback: 'Đang chạy tool…',
  },
  call_tool: {
    key: 'requirements.aiHitlMonitorActivity_call_tool',
    fallback: 'Đang gọi tool…',
  },
  observe: {
    key: 'requirements.aiHitlMonitorActivity_observe',
    fallback: 'Đang quan sát kết quả tool…',
  },
  assemble: {
    key: 'requirements.aiHitlMonitorActivity_assemble',
    fallback: 'Đang tổng hợp kết quả…',
  },
  evaluateLocal: {
    key: 'requirements.aiHitlMonitorActivity_evaluateLocal',
    fallback: 'Đang đánh giá đủ thông tin…',
  },
  metaGate: {
    key: 'requirements.aiHitlMonitorActivity_metaGate',
    fallback: 'Đang kiểm tra sẵn sàng Gate 1…',
  },
  // Legacy node id
  finalizeMeta: {
    key: 'requirements.aiHitlMonitorActivity_metaGate',
    fallback: 'Đang kiểm tra sẵn sàng Gate 1…',
  },
  scoreCompleteness: {
    key: 'requirements.aiHitlMonitorActivity_scoreCompleteness',
    fallback: 'Đang chấm đủ artifact…',
  },
  gateTools: {
    key: 'requirements.aiHitlMonitorActivity_gateTools',
    fallback: 'Đang tổng hợp engine…',
  },
});

function labelOf(t, key, fallback) {
  const value = typeof t === 'function' ? t(key) : '';
  return value || fallback;
}

/**
 * @param {string|null|undefined} toolName
 * @param {function} t
 * @returns {string}
 */
function toolShortLabel(toolName, t) {
  const tool = String(toolName || '').trim();
  const howStepKey = `requirements.aiHitlHowStep_${tool}`;
  const howLabel = typeof t === 'function' ? t(howStepKey) : '';
  if (howLabel && howLabel !== howStepKey) return howLabel;
  return tool;
}

/**
 * Activity line for one tool, or every tool started in the current HOW layer.
 * @param {string[]|string|null|undefined} toolNames
 * @param {function} t
 */
export function formatMonitorLayerActivity(toolNames, t) {
  const names = (Array.isArray(toolNames) ? toolNames : [toolNames])
    .map((name) => String(name || '').trim())
    .filter(Boolean);
  if (names.length <= 1) return formatMonitorToolActivity(names[0], t);
  const labels = names.map((name) => toolShortLabel(name, t)).join(', ');
  return (
    labelOf(t, 'requirements.aiHitlMonitorActivityLayer', 'Đang chạy cùng lúc: {labels}').replace(
      '{labels}',
      labels
    ) || `Đang chạy cùng lúc: ${labels}`
  );
}

export function formatMonitorToolActivity(toolName, t) {
  const tool = String(toolName || '').trim();
  if (!tool) {
    return labelOf(t, 'requirements.aiHitlMonitorProcessing', 'Đang xử lý…');
  }

  const mapped = TOOL_ACTIVITY[tool];
  if (mapped) {
    return labelOf(t, mapped.key, mapped.fallback);
  }

  const howStepKey = `requirements.aiHitlHowStep_${tool}`;
  const howLabel = typeof t === 'function' ? t(howStepKey) : '';
  if (howLabel && howLabel !== howStepKey) {
    return (
      labelOf(t, 'requirements.aiHitlMonitorWorkingOn', 'Đang xử lý: {label}').replace(
        '{label}',
        howLabel
      ) || `Đang xử lý: ${howLabel}`
    );
  }

  return (
    labelOf(t, 'requirements.aiHitlMonitorCallingTool', 'Đang gọi tool: {tool}').replace(
      '{tool}',
      tool
    ) || `Đang gọi tool: ${tool}`
  );
}

export { TOOL_ACTIVITY };
