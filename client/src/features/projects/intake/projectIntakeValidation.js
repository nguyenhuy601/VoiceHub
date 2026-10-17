import {
  countAssignedGateSlots,
  emptyGateSlots,
  gateRoleKeys,
  intakeSlotFilled,
  normalizeGateSlots,
} from '../wizard/projectWizardIntakeRoles.js';

/** Mirror validateCreateProjectIdentity — tránh kéo cả createProjectSeed vào node:test. */
function resolveIdentityValidationCode(form) {
  if (!String(form?.title || '').trim()) return 'title';
  const category = String(form?.category || 'internal').toLowerCase();
  if (category === 'customer') {
    const name = String(form?.customerName || form?.customer?.name || '').trim();
    if (!name) return 'customer';
  }
  return '';
}

/** Mirror isProjectDateRangeInvalid (projectHubUtils). */
function isProjectDateRangeInvalid(startYmd, endYmd) {
  const start = String(startYmd || '').trim().slice(0, 10);
  const end = String(endYmd || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return false;
  return start > end;
}

/** @typedef {'requirements'|'information'|'team'|'analysis'} IntakeSectionId */

/**
 * @param {object} form
 * @param {(key: string, opts?: object) => string} t
 * @returns {Record<string, string>}
 */
export function buildIntakeFieldErrors(form, t) {
  const errors = {};
  const tr = (key, fallback) => t(key) || fallback;

  if (!form?.intakeFiles?.requirement) {
    errors.requirement = tr(
      'adminTasks.wizardNeedRequirementFile',
      'Tải Customer Requirement bắt buộc.'
    );
  }

  const identityErr = resolveIdentityValidationCode(form);
  if (identityErr === 'title') {
    errors.title = tr('adminTasks.createNeedTitle', 'Nhập tên dự án.');
  }
  if (identityErr === 'customer') {
    errors.customerName = tr('adminTasks.wizardNeedCustomer', 'Nhập tên khách hàng.');
  }

  if (isProjectDateRangeInvalid(form?.startDate, form?.dueDate)) {
    errors.dateRange = tr(
      'adminTasks.wizardProjectDateRangeInvalid',
      'Ngày bắt đầu phải trước hoặc bằng ngày hạn.'
    );
  }

  const gates = normalizeGateSlots(form?.gateSlots || emptyGateSlots());
  for (const processKey of ['what', 'how']) {
    const missingAssignee = gateRoleKeys(gates, processKey).filter(
      (roleKey) => !intakeSlotFilled(gates[processKey], roleKey)
    );
    for (const roleKey of missingAssignee) {
      errors[`${processKey}:${roleKey}`] = tr(
        'adminTasks.intakeNeedRoleAssignee',
        'Gán nhân sự cho vai trò đã chọn.'
      );
    }
  }
  if (!countAssignedGateSlots(gates, 'what')) {
    errors.what = tr(
      'adminTasks.intakeNeedAnalysisMember',
      'Chọn ít nhất một thành viên cho phân tích yêu cầu.'
    );
  }
  if (!countAssignedGateSlots(gates, 'how')) {
    errors.how = tr(
      'adminTasks.intakeNeedPlanningMember',
      'Chọn ít nhất một thành viên cho lập kế hoạch dự án.'
    );
  }

  const mode = String(form?.analysisMode || '').toLowerCase();
  if (mode !== 'manual' && mode !== 'ai') {
    errors.analysisMode = tr('adminTasks.wizardNeedMode', 'Chọn phương thức phân tích.');
  }

  return errors;
}

export function intakeErrorCount(errors) {
  return Object.keys(errors || {}).length;
}

/**
 * @param {object} form
 * @param {Record<string, string>} errors
 * @param {boolean} showErrors
 */
export function buildIntakeSectionMeta(form, errors, showErrors) {
  const gates = normalizeGateSlots(form?.gateSlots || emptyGateSlots());
  const analysisAssigned = countAssignedGateSlots(gates, 'what');
  const planningAssigned = countAssignedGateSlots(gates, 'how');
  const analysisRoles = gateRoleKeys(gates, 'what').length;
  const planningRoles = gateRoleKeys(gates, 'how').length;
  const analysisComplete =
    analysisAssigned > 0 && analysisAssigned === analysisRoles;
  const planningComplete =
    planningAssigned > 0 && planningAssigned === planningRoles;
  const mode = String(form?.analysisMode || '').toLowerCase();
  const hasMode = mode === 'manual' || mode === 'ai';

  const reqOk = Boolean(form?.intakeFiles?.requirement);
  const identityErr = resolveIdentityValidationCode(form);
  const infoOk =
    !identityErr &&
    !isProjectDateRangeInvalid(form?.startDate, form?.dueDate);

  return {
    requirements: {
      complete: reqOk,
      hint: reqOk ? 'complete' : showErrors && errors.requirement ? 'error' : 'pending',
    },
    information: {
      complete: infoOk,
      hint: infoOk ? 'complete' : showErrors && (errors.title || errors.customerName || errors.dateRange) ? 'error' : 'pending',
    },
    analysisTeam: {
      complete: analysisComplete,
      assigned: analysisAssigned,
      hint: analysisComplete
        ? 'complete'
        : showErrors && (errors.what || Object.keys(errors).some((k) => k.startsWith('what:')))
          ? 'error'
          : 'partial',
    },
    planningTeam: {
      complete: planningComplete,
      assigned: planningAssigned,
      hint: planningComplete
        ? 'complete'
        : showErrors && (errors.how || Object.keys(errors).some((k) => k.startsWith('how:')))
          ? 'error'
          : 'partial',
    },
    team: {
      complete: analysisComplete && planningComplete,
      assigned: analysisAssigned + planningAssigned,
      hint: analysisComplete && planningComplete ? 'complete' : 'partial',
    },
    analysis: {
      complete: hasMode,
      hint: hasMode ? 'complete' : showErrors && errors.analysisMode ? 'error' : 'pending',
    },
  };
}

/** First scroll target id for validation focus. */
export function firstIntakeFieldAnchor(errors) {
  const order = [
    'requirement',
    'title',
    'customerName',
    'dateRange',
    'what',
    'how',
    'analysisMode',
  ];
  for (const key of order) {
    if (errors[key]) return `intake-field-${key}`;
  }
  const roleError = Object.keys(errors).find(
    (key) => key.startsWith('what:') || key.startsWith('how:')
  );
  if (roleError) {
    const [processKey, roleKey] = roleError.split(':');
    return `intake-field-${processKey}-${roleKey}`;
  }
  return null;
}
