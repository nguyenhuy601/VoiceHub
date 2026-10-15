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
  ProjectPlanTool: {
    key: 'requirements.aiHitlMonitorActivity_ProjectPlanTool',
    fallback: 'Đang tổng hợp project plan…',
  },
  RequirementAnalysisTool: {
    key: 'requirements.aiHitlMonitorActivity_RequirementAnalysisTool',
    fallback: 'Đang phân tích yêu cầu…',
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
