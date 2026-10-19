import {
  countAssignedGateSlots,
  emptyGateSlots,
  gateRoleKeys,
  intakeSlotFilled,
  normalizeGateSlots,
} from '../wizard/projectWizardIntakeRoles.js';
import { gateReviewPlanErrors } from '../wizard/gateReviewPlan.js';

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

/** Khớp maxlength schema Project — hiện trên ô, không đợi xác nhận. */
export const INTAKE_TEXT_LIMITS = Object.freeze({
  title: 180,
  description: 2000,
  projectCode: 64,
  customerName: 180,
});

function textLength(value) {
  return String(value || '').length;
}

function tooLongMessage(t, max) {
  const rendered = t('adminTasks.intakeFieldTooLong', { max });
  if (rendered && rendered !== 'adminTasks.intakeFieldTooLong') return rendered;
  return `Vượt quá ${max} ký tự.`;
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

  if (textLength(form?.title) > INTAKE_TEXT_LIMITS.title) {
    errors.title = tooLongMessage(t, INTAKE_TEXT_LIMITS.title);
  }
  if (textLength(form?.description) > INTAKE_TEXT_LIMITS.description) {
    errors.description = tooLongMessage(t, INTAKE_TEXT_LIMITS.description);
  }
  if (textLength(form?.projectCode) > INTAKE_TEXT_LIMITS.projectCode) {
    errors.projectCode = tooLongMessage(t, INTAKE_TEXT_LIMITS.projectCode);
  }
  if (textLength(form?.customerName) > INTAKE_TEXT_LIMITS.customerName) {
    errors.customerName = tooLongMessage(t, INTAKE_TEXT_LIMITS.customerName);
  }

  if (!form?.intakeFiles?.requirement) {
    errors.requirement = tr(
      'adminTasks.wizardNeedRequirementFile',
      'Tải Customer Requirement bắt buộc.'
    );
  }

  const identityErr = resolveIdentityValidationCode(form);
  if (identityErr === 'title' && !errors.title) {
    errors.title = tr('adminTasks.createNeedTitle', 'Nhập tên dự án.');
  }
  if (identityErr === 'customer' && !errors.customerName) {
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
  const planMessage = {
    mode: ['adminTasks.intakeNeedReviewMode', 'Chọn duyệt tuần tự hoặc duyệt song song.'],
    parallel: ['adminTasks.intakeNeedParallelRoles', 'Chọn vai trò duyệt song song.'],
    synthesis: ['adminTasks.intakeNeedSynthesisRole', 'Chọn vai trò tổng hợp.'],
    final: ['adminTasks.intakeNeedFinalRole', 'Chọn vai trò Tổng duyệt.'],
    distinct: ['adminTasks.intakeReviewRolesDistinct', 'Vai trò tổng hợp và Tổng duyệt phải khác nhau.'],
    coverage: ['adminTasks.intakeReviewRoleCoverage', 'Mỗi vai trò trong cổng phải được giao một việc duyệt.'],
    order: ['adminTasks.intakeNeedReviewOrder', 'Sắp xếp thứ tự duyệt.'],
  };
  for (const processKey of ['what', 'how']) {
    const problems = gateReviewPlanErrors(
      form?.gateReview?.[processKey],
      gateRoleKeys(gates, processKey)
    );
    if (!problems.length) continue;
    const [messageKey, fallback] = planMessage[problems[0]] || planMessage.mode;
    errors[`${processKey}:review`] = tr(messageKey, fallback);
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

/** Số ô đang vượt maxlength — hiện trước khi bấm xác nhận. */
export function intakeLiveLengthErrorCount(form) {
  let count = 0;
  if (textLength(form?.title) > INTAKE_TEXT_LIMITS.title) count += 1;
  if (textLength(form?.description) > INTAKE_TEXT_LIMITS.description) count += 1;
  if (textLength(form?.projectCode) > INTAKE_TEXT_LIMITS.projectCode) count += 1;
  if (textLength(form?.customerName) > INTAKE_TEXT_LIMITS.customerName) count += 1;
  return count;
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
    analysisAssigned > 0 && analysisAssigned === analysisRoles && !errors['what:review'];
  const planningComplete =
    planningAssigned > 0 && planningAssigned === planningRoles && !errors['how:review'];
  const mode = String(form?.analysisMode || '').toLowerCase();
  const hasMode = mode === 'manual' || mode === 'ai';

  const reqOk = Boolean(form?.intakeFiles?.requirement);
  const identityErr = resolveIdentityValidationCode(form);
  const textTooLong =
    textLength(form?.title) > INTAKE_TEXT_LIMITS.title ||
    textLength(form?.description) > INTAKE_TEXT_LIMITS.description ||
    textLength(form?.projectCode) > INTAKE_TEXT_LIMITS.projectCode ||
    textLength(form?.customerName) > INTAKE_TEXT_LIMITS.customerName;
  const infoOk =
    !identityErr &&
    !textTooLong &&
    !isProjectDateRangeInvalid(form?.startDate, form?.dueDate);

  return {
    requirements: {
      complete: reqOk,
      hint: reqOk ? 'complete' : showErrors && errors.requirement ? 'error' : 'pending',
    },
    information: {
      complete: infoOk,
      hint: infoOk
        ? 'complete'
        : textTooLong ||
            (showErrors &&
              (errors.title || errors.description || errors.projectCode || errors.customerName || errors.dateRange))
          ? 'error'
          : 'pending',
    },
    analysisTeam: {
      complete: analysisComplete,
      assigned: analysisAssigned,
      hint: analysisComplete
        ? 'complete'
        : showErrors && (errors.what || errors['what:review'] || Object.keys(errors).some((k) => k.startsWith('what:')))
          ? 'error'
          : 'partial',
    },
    planningTeam: {
      complete: planningComplete,
      assigned: planningAssigned,
      hint: planningComplete
        ? 'complete'
        : showErrors && (errors.how || errors['how:review'] || Object.keys(errors).some((k) => k.startsWith('how:')))
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
    'description',
    'projectCode',
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
