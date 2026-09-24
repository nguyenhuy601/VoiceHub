/**
 * FE mirror of BE planningWorkbookCatalog — list/form fields per Planning kind.
 * Keep in sync with services/project-service/src/constants/planningWorkbookCatalog.js
 */

/** Shared identity fields — parent only on WBS (tree). */
const COMMON = Object.freeze([
  { key: 'externalKey', required: true, topLevel: true, input: 'text' },
  { key: 'title', required: true, topLevel: true, input: 'text' },
  { key: 'summary', required: false, topLevel: true, input: 'textarea' },
]);

/** @type {Record<string, Array<{ key: string, required?: boolean, topLevel?: boolean, structured?: boolean, input: string }>>} */
export const PLANNING_SHEET_FIELDS = Object.freeze({
  WBS: [
    ...COMMON,
    { key: 'parentExternalKey', required: false, topLevel: true, input: 'text' },
    { key: 'startDate', structured: true, input: 'date' },
    { key: 'endDate', structured: true, input: 'date' },
    { key: 'effortHours', structured: true, input: 'number' },
    { key: 'assigneeEmail', structured: true, input: 'text' },
    { key: 'assigneeName', structured: true, input: 'text' },
    { key: 'sourceFrKey', structured: true, input: 'text' },
    { key: 'skillKeys', structured: true, input: 'text' },
  ],
  ARCHITECTURE: [
    ...COMMON,
    { key: 'body', topLevel: true, input: 'textarea' },
    { key: 'techStack', structured: true, input: 'text' },
    { key: 'diagramRef', structured: true, input: 'text' },
  ],
  RESOURCE: [...COMMON, { key: 'effortHours', structured: true, input: 'number' }],
  DEPENDENCY: [
    ...COMMON,
    { key: 'fromKey', required: true, structured: true, input: 'text' },
    { key: 'toKey', required: true, structured: true, input: 'text' },
    { key: 'dependencyType', structured: true, input: 'selectDep' },
    { key: 'lagDays', structured: true, input: 'number' },
  ],
  SCHEDULE: [
    ...COMMON,
    { key: 'startDate', required: true, structured: true, input: 'date' },
    { key: 'endDate', required: true, structured: true, input: 'date' },
    { key: 'phaseKey', structured: true, input: 'text' },
  ],
  MILESTONE: [
    ...COMMON,
    { key: 'targetDate', required: true, structured: true, input: 'date' },
    { key: 'targetPhase', structured: true, input: 'text' },
  ],
  RELEASE: [
    ...COMMON,
    { key: 'targetDate', required: true, structured: true, input: 'date' },
    { key: 'startDate', structured: true, input: 'date' },
    { key: 'endDate', structured: true, input: 'date' },
  ],
  RISK: [
    ...COMMON,
    { key: 'impact', structured: true, input: 'selectImpact' },
    { key: 'probability', structured: true, input: 'selectImpact' },
    { key: 'sourceNfrKey', structured: true, input: 'text' },
    { key: 'mitigation', structured: true, input: 'textarea' },
  ],
});

const LABEL_KEYS = Object.freeze({
  externalKey: 'workspace.phase1ColKey',
  title: 'workspace.phase1ColTitle',
  summary: 'workspace.phase1PlaceholderSummary',
  parentExternalKey: 'workspace.phase1ParentKey',
  startDate: 'workspace.phase1StartDate',
  endDate: 'workspace.phase1EndDate',
  targetDate: 'workspace.phase1TargetDate',
  effortHours: 'workspace.phase1RoleEffort',
  assigneeEmail: 'workspace.phase1PlanningFieldAssigneeEmail',
  assigneeName: 'workspace.phase1PlanningFieldAssigneeName',
  sourceFrKey: 'workspace.phase1PlanningFieldSourceFrKey',
  skillKeys: 'workspace.phase1PlanningFieldSkillKeys',
  body: 'workspace.phase1PlanningFieldBody',
  techStack: 'workspace.phase1PlanningFieldTechStack',
  diagramRef: 'workspace.phase1PlanningFieldDiagramRef',
  fromKey: 'workspace.phase1DepFrom',
  toKey: 'workspace.phase1DepTo',
  dependencyType: 'workspace.phase1PlanningFieldDepType',
  lagDays: 'workspace.phase1PlanningFieldLagDays',
  phaseKey: 'workspace.phase1PlanningFieldPhaseKey',
  targetPhase: 'workspace.phase1PlanningFieldTargetPhase',
  impact: 'workspace.phase1PlanningFieldImpact',
  probability: 'workspace.phase1PlanningFieldProbability',
  sourceNfrKey: 'workspace.phase1PlanningFieldSourceNfrKey',
  mitigation: 'workspace.phase1PlanningFieldMitigation',
  roles: 'workspace.phase1PlanningFieldRoles',
  status: 'workspace.phase1ColStatus',
  source: 'workspace.phase1ColSource',
});

export function planningFieldLabelKey(fieldKey) {
  return LABEL_KEYS[fieldKey] || `workspace.phase1PlanningField${fieldKey}`;
}

export function fieldsForPlanningKind(kind) {
  const k = String(kind || '')
    .trim()
    .toUpperCase();
  return PLANNING_SHEET_FIELDS[k] || COMMON;
}

function asText(value) {
  if (value == null) return '';
  if (Array.isArray(value)) return value.map((v) => String(v || '').trim()).filter(Boolean).join(', ');
  return String(value).trim();
}

export function truncatePlanningCell(text, max = 80) {
  const s = asText(text);
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

function structured(row) {
  return row?.structured && typeof row.structured === 'object' ? row.structured : {};
}

function getFieldValue(row, field) {
  if (field.key === 'externalKey') return asText(row?.externalKey);
  if (field.key === 'title') return asText(row?.title);
  if (field.key === 'summary') return asText(row?.summary);
  if (field.key === 'parentExternalKey') return asText(row?.parentExternalKey);
  if (field.key === 'body') return asText(row?.body);
  if (field.key === 'skillKeys') return asText(structured(row).skillKeys);
  const st = structured(row);
  return asText(st[field.key]);
}

/**
 * List columns for a Planning kind — workbook fields + status/source (system).
 * RESOURCE adds roles summary (edited via Resource panel).
 */
export function getPlanningListColumns(kind) {
  const k = String(kind || '')
    .trim()
    .toUpperCase();
  const fields = fieldsForPlanningKind(k);
  const cols = fields.map((f) => ({
    id: f.key,
    labelKey: planningFieldLabelKey(f.key),
    mono: f.key === 'externalKey' || f.key.endsWith('Key') || f.key === 'fromKey' || f.key === 'toKey',
    isStatus: false,
    getValue: (row) => getFieldValue(row, f),
  }));

  if (k === 'RESOURCE') {
    cols.push({
      id: 'roles',
      labelKey: planningFieldLabelKey('roles'),
      mono: false,
      isStatus: false,
      getValue: (row) => {
        const roles = Array.isArray(structured(row).roles) ? structured(row).roles : [];
        if (!roles.length) return '';
        return roles
          .map((r) => `${r.roleKey || r.title || '?'}${r.count != null ? `×${r.count}` : ''}`)
          .join(', ');
      },
    });
  }

  cols.push({
    id: 'status',
    labelKey: planningFieldLabelKey('status'),
    mono: false,
    isStatus: true,
    getValue: (row) => asText(row?.status),
  });
  cols.push({
    id: 'source',
    labelKey: planningFieldLabelKey('source'),
    mono: false,
    isStatus: false,
    getValue: (row) => asText(row?.source),
  });

  return cols;
}

/** Empty draft object for form. */
export function emptyPlanningDraft(kind) {
  const k = String(kind || '')
    .trim()
    .toUpperCase();
  const draft = {};
  for (const f of fieldsForPlanningKind(k)) {
    if (f.key === 'dependencyType') draft[f.key] = 'FS';
    else if (f.key === 'impact' || f.key === 'probability') draft[f.key] = 'medium';
    else draft[f.key] = '';
  }
  if (k === 'RESOURCE') {
    draft.rolesDraft = [{ roleKey: '', title: '', count: 1, skillKeysText: '', effortHours: '', notes: '' }];
  }
  return draft;
}

export function draftFromPlanningArtifact(artifact) {
  const kind = artifact?.kind;
  const draft = emptyPlanningDraft(kind);
  const st = structured(artifact);
  for (const f of fieldsForPlanningKind(kind)) {
    if (f.topLevel) {
      draft[f.key] = artifact?.[f.key] != null ? String(artifact[f.key]) : '';
    } else if (f.key === 'skillKeys') {
      draft.skillKeys = asText(st.skillKeys);
    } else if (f.key === 'effortHours' || f.key === 'lagDays') {
      draft[f.key] = st[f.key] != null && st[f.key] !== '' ? String(st[f.key]) : '';
    } else {
      draft[f.key] = st[f.key] != null ? String(st[f.key]) : draft[f.key] || '';
    }
  }
  if (String(kind || '').toUpperCase() === 'RESOURCE') {
    const raw = Array.isArray(st.roles) ? st.roles : [];
    draft.rolesDraft = raw.length
      ? raw.map((r) => ({
          roleKey: r.roleKey || '',
          title: r.title || '',
          count: r.count != null ? r.count : 1,
          skillKeysText: Array.isArray(r.skillKeys) ? r.skillKeys.join(', ') : '',
          effortHours: r.effortHours != null ? String(r.effortHours) : '',
          notes: r.notes || '',
        }))
      : [{ roleKey: '', title: '', count: 1, skillKeysText: '', effortHours: '', notes: '' }];
  }
  return draft;
}

/**
 * Build API payload from draft for create/update.
 */
export function buildPlanningSubmitPayload(kind, draft) {
  const k = String(kind || '')
    .trim()
    .toUpperCase();
  const structuredOut = {};
  let body = '';
  for (const f of fieldsForPlanningKind(k)) {
    const raw = draft[f.key];
    if (f.topLevel && f.key === 'body') {
      body = String(raw || '').trim();
      continue;
    }
    if (f.structured) {
      if (raw === undefined || raw === null || String(raw).trim() === '') continue;
      if (f.key === 'effortHours' || f.key === 'lagDays') {
        const n = Number(raw);
        if (Number.isFinite(n)) structuredOut[f.key] = n;
      } else if (f.key === 'skillKeys') {
        structuredOut.skillKeys = String(raw)
          .split(/[,;|]/)
          .map((s) => s.trim())
          .filter(Boolean);
      } else {
        structuredOut[f.key] = String(raw).trim();
      }
    }
  }
  if (k === 'RESOURCE' && Array.isArray(draft.rolesDraft)) {
    structuredOut.roles = draft.rolesDraft
      .filter((r) => String(r?.roleKey || '').trim())
      .map((r) => ({
        roleKey: String(r.roleKey).trim(),
        title: String(r.title || r.roleKey).trim() || String(r.roleKey).trim(),
        count: Math.max(1, Number(r.count) || 1),
        skillKeys: String(r.skillKeysText || '')
          .split(/[,;|]/)
          .map((s) => s.trim())
          .filter(Boolean),
        effortHours: r.effortHours === '' || r.effortHours == null ? null : Number(r.effortHours),
        notes: String(r.notes || '').trim(),
      }));
  }
  return {
    externalKey: String(draft.externalKey || '').trim(),
    title: String(draft.title || '').trim(),
    summary: String(draft.summary || '').trim(),
    parentExternalKey: String(draft.parentExternalKey || '').trim(),
    body,
    structured: structuredOut,
  };
}

/** Editable content fields count (excludes system status/source). */
export function countPlanningFormFields(kind) {
  const k = String(kind || '')
    .trim()
    .toUpperCase();
  const base = fieldsForPlanningKind(k).length;
  return k === 'RESOURCE' ? base + 1 : base; // + roles block
}
