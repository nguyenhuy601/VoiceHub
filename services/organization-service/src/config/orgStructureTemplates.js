/**
 * Huy: Template cơ cấu tổ chức mặc định cho công ty Software / IT.
 * levelKey dùng trong OrgLevelSchema; seedUnits mô tả cây gợi ý (áp dụng khi org trống).
 */

const UNIT_KIND_CATALOG = {
  engineering: ['software_engineering', 'backend', 'frontend', 'mobile', 'devops', 'qa', 'security', 'data'],
  product: ['product_management', 'product_design', 'ux_ui', 'business_analyst'],
  business: ['sales', 'marketing', 'customer_success'],
  operations: ['hr', 'finance', 'administration'],
};

/** @typedef {{ key: string, label: string, order: number, enabled: boolean, allowsChildren: boolean }} OrgLevelDef */
/** @typedef {{ name: string, levelKey: string, unitKind?: string, children?: object[] }} SeedUnit */

/**
 * @type {Record<string, { id: string, label: string, description: string, levels: OrgLevelDef[], seedUnits: SeedUnit[] }>}
 */
const ORG_STRUCTURE_TEMPLATES = {
  startup: {
    id: 'startup',
    label: 'Startup Software',
    description: 'Company → Team (phẳng, ít tầng).',
    levels: [{ key: 'team', label: 'Team', order: 1, enabled: true, allowsChildren: true }],
    seedUnits: [
      { name: 'Product Team', levelKey: 'team', unitKind: 'product_management' },
      { name: 'Engineering Team', levelKey: 'team', unitKind: 'software_engineering' },
      { name: 'Business Team', levelKey: 'team', unitKind: 'sales' },
    ],
  },
  product: {
    id: 'product',
    label: 'Product Company',
    description: 'Division → Team (product-oriented).',
    levels: [
      { key: 'division', label: 'Division', order: 1, enabled: true, allowsChildren: true },
      { key: 'team', label: 'Team', order: 2, enabled: true, allowsChildren: true },
    ],
    seedUnits: [
      {
        name: 'Product Division',
        levelKey: 'division',
        unitKind: 'product_management',
        children: [
          { name: 'Product Team', levelKey: 'team', unitKind: 'product_management' },
          { name: 'Engineering Team', levelKey: 'team', unitKind: 'software_engineering' },
          { name: 'Design Team', levelKey: 'team', unitKind: 'ux_ui' },
          { name: 'Data Team', levelKey: 'team', unitKind: 'data' },
        ],
      },
    ],
  },
  outsourcing: {
    id: 'outsourcing',
    label: 'IT Outsourcing / Delivery',
    description: 'Delivery Division → Project Teams.',
    levels: [
      { key: 'division', label: 'Division', order: 1, enabled: true, allowsChildren: true },
      { key: 'team', label: 'Project Team', order: 2, enabled: true, allowsChildren: true },
    ],
    seedUnits: [
      {
        name: 'Delivery Division',
        levelKey: 'division',
        unitKind: 'software_engineering',
        children: [
          { name: 'Project Team A', levelKey: 'team', unitKind: 'software_engineering' },
          { name: 'Project Team B', levelKey: 'team', unitKind: 'software_engineering' },
          { name: 'Project Team C', levelKey: 'team', unitKind: 'software_engineering' },
        ],
      },
    ],
  },
  'enterprise-software': {
    id: 'enterprise-software',
    label: 'Enterprise Software',
    description: 'Division → Department → Team.',
    levels: [
      { key: 'division', label: 'Division', order: 1, enabled: true, allowsChildren: true },
      { key: 'department', label: 'Department', order: 2, enabled: true, allowsChildren: true },
      { key: 'team', label: 'Team', order: 3, enabled: true, allowsChildren: true },
    ],
    seedUnits: [
      {
        name: 'Engineering Division',
        levelKey: 'division',
        unitKind: 'software_engineering',
        children: [
          {
            name: 'Backend Department',
            levelKey: 'department',
            unitKind: 'backend',
            children: [{ name: 'Backend Team', levelKey: 'team', unitKind: 'backend' }],
          },
          {
            name: 'Frontend Department',
            levelKey: 'department',
            unitKind: 'frontend',
            children: [{ name: 'Frontend Team', levelKey: 'team', unitKind: 'frontend' }],
          },
          {
            name: 'QA Department',
            levelKey: 'department',
            unitKind: 'qa',
            children: [{ name: 'QA Team', levelKey: 'team', unitKind: 'qa' }],
          },
        ],
      },
    ],
  },
  functional: {
    id: 'functional',
    label: 'Functional Organization',
    description: 'Department → Team (functional silos).',
    levels: [
      { key: 'department', label: 'Department', order: 1, enabled: true, allowsChildren: true },
      { key: 'team', label: 'Team', order: 2, enabled: true, allowsChildren: true },
    ],
    seedUnits: [
      {
        name: 'Engineering Department',
        levelKey: 'department',
        unitKind: 'software_engineering',
        children: [
          { name: 'Backend Team', levelKey: 'team', unitKind: 'backend' },
          { name: 'Frontend Team', levelKey: 'team', unitKind: 'frontend' },
          { name: 'QA Team', levelKey: 'team', unitKind: 'qa' },
        ],
      },
    ],
  },
  /** Huy: tương thích VoiceHub hiện tại Branch→Division→Department→Team */
  'enterprise-compat': {
    id: 'enterprise-compat',
    label: 'VoiceHub Legacy Compat',
    description: 'Branch → Division → Department → Team (map 1:1 data hiện có).',
    levels: [
      { key: 'branch', label: 'Branch', order: 1, enabled: true, allowsChildren: true },
      { key: 'division', label: 'Division', order: 2, enabled: true, allowsChildren: true },
      { key: 'department', label: 'Department', order: 3, enabled: true, allowsChildren: true },
      { key: 'team', label: 'Team', order: 4, enabled: true, allowsChildren: true },
    ],
    seedUnits: [],
  },
};

function listOrgStructureTemplates() {
  return Object.values(ORG_STRUCTURE_TEMPLATES).map((t) => ({
    id: t.id,
    label: t.label,
    description: t.description,
    levels: t.levels,
  }));
}

function getOrgStructureTemplate(templateId) {
  const id = String(templateId || '').trim();
  return ORG_STRUCTURE_TEMPLATES[id] || null;
}

function cloneLevels(levels) {
  return (levels || []).map((l, i) => ({
    key: String(l.key || '').trim(),
    label: String(l.label || l.key || '').trim(),
    order: Number(l.order) || i + 1,
    enabled: l.enabled !== false,
    allowsChildren: l.allowsChildren !== false,
  }));
}

module.exports = {
  UNIT_KIND_CATALOG,
  ORG_STRUCTURE_TEMPLATES,
  listOrgStructureTemplates,
  getOrgStructureTemplate,
  cloneLevels,
};
