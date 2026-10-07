import {
  emptyIntakeSlots,
  intakeSlotFilled,
  INTAKE_LEAD_ROLE_KEYS,
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

  const slots = { ...emptyIntakeSlots(), ...(form?.intakeSlots || {}) };
  if (!intakeSlotFilled(slots, 'product_owner')) {
    errors.product_owner = tr('adminTasks.wizardNeedPo', 'Chọn Product Owner.');
  }
  if (!intakeSlotFilled(slots, 'project_manager')) {
    errors.project_manager = tr('adminTasks.wizardNeedPm', 'Chọn Project Manager.');
  }
  if (!intakeSlotFilled(slots, 'business_analyst')) {
    errors.business_analyst = tr('adminTasks.wizardRosterNeedBa', 'Chọn Business Analyst.');
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
  const slots = { ...emptyIntakeSlots(), ...(form?.intakeSlots || {}) };
  const teamFilled = INTAKE_LEAD_ROLE_KEYS.filter((k) => intakeSlotFilled(slots, k)).length;
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
    team: {
      complete: teamFilled === 3,
      assigned: teamFilled,
      hint:
        teamFilled === 3
          ? 'complete'
          : showErrors && (errors.product_owner || errors.project_manager || errors.business_analyst)
            ? 'error'
            : 'partial',
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
    'product_owner',
    'project_manager',
    'business_analyst',
    'analysisMode',
  ];
  for (const key of order) {
    if (errors[key]) return `intake-field-${key}`;
  }
  return null;
}
