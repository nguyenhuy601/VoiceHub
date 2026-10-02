/**
 * Business copy keys for WHAT Monitor from view-model fields (no thresholds here).
 */

const MACRO_COPY = {
  1: {
    titleKey: 'requirements.phase1Step1',
    descriptionKey: 'requirements.aiHitlMonitorMacroDesc1',
    titleFallback: 'Input Sources',
    descriptionFallback: 'Đang nạp SRS pack và chuẩn bị dữ liệu đầu vào.',
  },
  2: {
    titleKey: 'requirements.phase1Step2',
    descriptionKey: 'requirements.aiHitlMonitorMacroDesc2',
    titleFallback: 'Requirement Understanding',
    descriptionFallback: 'Đang phân tích và kiểm tra chất lượng yêu cầu.',
  },
  3: {
    titleKey: 'requirements.phase1Step3',
    descriptionKey: 'requirements.aiHitlMonitorMacroDesc3',
    titleFallback: 'Semantic Fetch',
    descriptionFallback: 'Đang truy vấn ngữ cảnh semantic.',
  },
  4: {
    titleKey: 'requirements.phase1Step4',
    descriptionKey: 'requirements.aiHitlMonitorMacroDesc4',
    titleFallback: 'Agentic Orchestration',
    descriptionFallback: 'Đang tổng hợp và điều phối phân tích.',
  },
  5: {
    titleKey: 'requirements.phase1Step5',
    descriptionKey: 'requirements.aiHitlMonitorMacroDesc5',
    titleFallback: 'Human Review (Gate 1)',
    descriptionFallback: 'Chờ duyệt Gate 1 (BA → PO).',
  },
  6: {
    titleKey: 'requirements.phase1Step6',
    descriptionKey: 'requirements.aiHitlMonitorMacroDesc6',
    titleFallback: 'Approved SRS',
    descriptionFallback: 'SRS đã được duyệt.',
  },
};

/**
 * @param {{ macroStep?: number, waitingHuman?: boolean, showSoftHint?: boolean, softHintLong?: boolean }} vm
 */
export function getWhatStatusCopy(vm = {}) {
  const macro = Number(vm.macroStep) || 1;
  const base = MACRO_COPY[macro] || MACRO_COPY[1];
  if (vm.waitingHuman) {
    return {
      titleKey: base.titleKey,
      descriptionKey: 'requirements.aiHitlMonitorDataGateHint',
      titleFallback: base.titleFallback,
      descriptionFallback: 'AI đang chờ Data Gate — chuyển tab Duyệt để Pass/Reject.',
    };
  }
  if (vm.showSoftHint && vm.softHintLong) {
    return {
      ...base,
      descriptionKey: 'requirements.aiHitlMonitorSoftHintLong',
      descriptionFallback:
        'Hệ thống đang xử lý dữ liệu đầu vào. Bước này có thể mất thêm thời gian.',
    };
  }
  if (vm.showSoftHint) {
    return {
      ...base,
      descriptionKey: 'requirements.aiHitlMonitorSoftHint',
      descriptionFallback: 'Đang chuẩn bị dữ liệu phân tích…',
    };
  }
  return base;
}

export function resolveActivityLabelKey(activity) {
  if (!activity || !activity.kind) return null;
  if (activity.kind === 'call_tool') {
    return 'requirements.aiHitlMonitorCallingTool';
  }
  const map = {
    understand: 'requirements.aiHitlMonitorActivity_understand',
    plan: 'requirements.aiHitlMonitorActivity_plan',
    observe: 'requirements.aiHitlMonitorActivity_observe',
    evaluate: 'requirements.aiHitlMonitorActivity_evaluate',
  };
  return map[activity.kind] || null;
}

export default getWhatStatusCopy;
