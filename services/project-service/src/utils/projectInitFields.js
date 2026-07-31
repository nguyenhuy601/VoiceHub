/**
 * Pure helpers — G1 Create Project lifecycle fields (không phụ thuộc DB).
 */

const PROJECT_STATUSES = Object.freeze([
  'planning',
  'ready_for_planning',
  'in_development',
  'on_hold',
  'closed',
]);

const PROJECT_CATEGORIES = Object.freeze(['internal', 'customer']);
const PROJECT_PRIORITIES = Object.freeze(['low', 'medium', 'high', 'urgent']);
const PROJECT_METHODOLOGIES = Object.freeze(['scrum', 'kanban', 'waterfall']);
const PROJECT_TYPES = Object.freeze([
  'software',
  'integration',
  'maintenance',
  'research',
  'other',
]);

const WEEKDAYS = Object.freeze([
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
]);

function parseOptionalDate(raw) {
  if (raw === undefined) return { skip: true };
  if (raw === null || raw === '') return { ok: true, value: null };
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return { ok: false, message: 'Ngày không hợp lệ' };
  return { ok: true, value: parsed };
}

/**
 * Normalize + validate G1 fields from create/patch body.
 * @returns {{ ok: true, fields: object } | { ok: false, message: string }}
 */
function buildProjectInitFields(raw = {}, { partial = false } = {}) {
  const body = raw && typeof raw === 'object' ? raw : {};
  const fields = {};

  if (body.status !== undefined) {
    const st = String(body.status || '').trim().toLowerCase();
    if (!PROJECT_STATUSES.includes(st)) {
      return { ok: false, message: 'status dự án không hợp lệ' };
    }
    fields.status = st;
  } else if (!partial) {
    fields.status = 'planning';
  }

  if (body.projectType !== undefined || !partial) {
    const pt = String(body.projectType || 'software').trim().toLowerCase() || 'software';
    if (!PROJECT_TYPES.includes(pt)) {
      return { ok: false, message: 'projectType không hợp lệ' };
    }
    fields.projectType = pt;
  }

  if (body.category !== undefined || !partial) {
    const cat = String(body.category || 'internal').trim().toLowerCase() || 'internal';
    if (!PROJECT_CATEGORIES.includes(cat)) {
      return { ok: false, message: 'category phải là internal hoặc customer' };
    }
    fields.category = cat;
  }

  if (body.priority !== undefined || !partial) {
    const pr = String(body.priority || 'medium').trim().toLowerCase() || 'medium';
    if (!PROJECT_PRIORITIES.includes(pr)) {
      return { ok: false, message: 'priority không hợp lệ' };
    }
    fields.priority = pr;
  }

  if (body.tags !== undefined) {
    fields.tags = [...new Set(
      (Array.isArray(body.tags) ? body.tags : String(body.tags || '').split(','))
        .map((t) => String(t || '').trim().slice(0, 48))
        .filter(Boolean)
    )].slice(0, 20);
  } else if (!partial) {
    fields.tags = [];
  }

  const start = parseOptionalDate(body.startDate);
  if (!start.skip) {
    if (!start.ok) return { ok: false, message: 'startDate không hợp lệ' };
    fields.startDate = start.value;
  }

  const expectedEnd = parseOptionalDate(
    body.expectedEndDate !== undefined ? body.expectedEndDate : body.dueDate
  );
  if (!expectedEnd.skip) {
    if (!expectedEnd.ok) return { ok: false, message: 'expectedEndDate/dueDate không hợp lệ' };
    fields.expectedEndDate = expectedEnd.value;
    fields.dueDate = expectedEnd.value;
  }

  if (body.estimatedDurationDays !== undefined) {
    if (body.estimatedDurationDays === null || body.estimatedDurationDays === '') {
      fields.estimatedDurationDays = null;
    } else {
      const n = Number(body.estimatedDurationDays);
      if (!Number.isFinite(n) || n < 0 || n > 3650) {
        return { ok: false, message: 'estimatedDurationDays không hợp lệ' };
      }
      fields.estimatedDurationDays = Math.round(n);
    }
  }

  if (body.workingCalendar !== undefined) {
    const cal = String(body.workingCalendar || 'standard').trim().slice(0, 64) || 'standard';
    fields.workingCalendar = cal;
  } else if (!partial) {
    fields.workingCalendar = 'standard';
  }

  if (body.methodology !== undefined || !partial) {
    const m = String(body.methodology || 'kanban').trim().toLowerCase() || 'kanban';
    if (!PROJECT_METHODOLOGIES.includes(m)) {
      return { ok: false, message: 'methodology phải là scrum, kanban hoặc waterfall' };
    }
    fields.methodology = m;
  }

  const settingsRaw =
    body.methodologySettings && typeof body.methodologySettings === 'object'
      ? body.methodologySettings
      : {};
  if (body.methodologySettings !== undefined || body.methodology !== undefined || !partial) {
    const methodology = fields.methodology || String(body.methodology || 'kanban').toLowerCase();
    const settings = {};
    if (methodology === 'scrum') {
      const dur = Number(settingsRaw.sprintDurationDays ?? body.sprintDurationDays ?? 14);
      if (!Number.isFinite(dur) || dur < 1 || dur > 60) {
        return { ok: false, message: 'sprintDurationDays phải từ 1–60' };
      }
      settings.sprintDurationDays = Math.round(dur);
      const day = String(settingsRaw.sprintStartDay || body.sprintStartDay || 'monday')
        .trim()
        .toLowerCase();
      if (!WEEKDAYS.includes(day)) {
        return { ok: false, message: 'sprintStartDay không hợp lệ' };
      }
      settings.sprintStartDay = day;
    }
    if (methodology === 'kanban') {
      const wip = Number(settingsRaw.wipLimit ?? body.wipLimit ?? 0);
      if (!Number.isFinite(wip) || wip < 0 || wip > 500) {
        return { ok: false, message: 'wipLimit không hợp lệ' };
      }
      settings.wipLimit = Math.round(wip);
    }
    fields.methodologySettings = settings;
  }

  const category = fields.category || String(body.category || '').toLowerCase();
  if (body.customer !== undefined || category === 'customer') {
    const c = body.customer && typeof body.customer === 'object' ? body.customer : {};
    if (category === 'customer') {
      const name = String(c.name || c.customer || body.customerName || '').trim();
      if (!name) {
        return { ok: false, message: 'Customer bắt buộc khi category = customer' };
      }
      fields.customer = {
        name: name.slice(0, 180),
        company: String(c.company || body.customerCompany || '').trim().slice(0, 180),
        contactPerson: String(c.contactPerson || body.contactPerson || '').trim().slice(0, 180),
        contractCode: String(c.contractCode || body.contractCode || '').trim().slice(0, 64),
      };
    } else if (body.customer === null || category === 'internal') {
      fields.customer = null;
    }
  }

  if (partial && !Object.keys(fields).length) {
    return { ok: false, message: 'Không có field lifecycle hợp lệ' };
  }
  return { ok: true, fields };
}

module.exports = {
  PROJECT_STATUSES,
  PROJECT_CATEGORIES,
  PROJECT_PRIORITIES,
  PROJECT_METHODOLOGIES,
  PROJECT_TYPES,
  WEEKDAYS,
  buildProjectInitFields,
};
