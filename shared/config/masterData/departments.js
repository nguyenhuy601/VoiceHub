/**
 * Master Department catalog — SSOT Phase 2.0.
 * Org Admin chỉ enable/disable; không tạo key mới.
 */

const MASTER_DEPARTMENTS = Object.freeze([
  { key: 'engineering', label: 'Engineering', sortOrder: 10 },
  { key: 'qa', label: 'Quality Assurance', sortOrder: 20 },
  { key: 'product', label: 'Product', sortOrder: 30 },
  { key: 'business_analysis', label: 'Business Analysis', sortOrder: 40 },
  { key: 'devops', label: 'DevOps', sortOrder: 50 },
  { key: 'design', label: 'Design', sortOrder: 60 },
  { key: 'sales', label: 'Sales', sortOrder: 70 },
  { key: 'hr', label: 'Human Resources', sortOrder: 80 },
  { key: 'operations', label: 'Operations', sortOrder: 90 },
  { key: 'finance', label: 'Finance', sortOrder: 100 },
  { key: 'marketing', label: 'Marketing', sortOrder: 110 },
]);

const MASTER_DEPARTMENT_KEYS = Object.freeze(MASTER_DEPARTMENTS.map((d) => d.key));

function getDepartmentByKey(key) {
  const k = String(key || '').trim().toLowerCase();
  return MASTER_DEPARTMENTS.find((d) => d.key === k) || null;
}

module.exports = {
  MASTER_DEPARTMENTS,
  MASTER_DEPARTMENT_KEYS,
  getDepartmentByKey,
};
