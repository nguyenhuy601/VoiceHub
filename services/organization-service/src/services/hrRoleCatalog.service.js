/**
 * HR Role catalog — keys gợi ý; giá trị lưu trên profile.jobTitle (zero permission).
 */
const {
  ROLE_KIND,
  DEFAULT_HR_ROLE_KEYS,
  assertNotHrRoleForPermission,
} = require('@enterprise/shared/config/roleTaxonomy');

const HR_ROLE_LABELS = Object.freeze({
  senior_backend: 'Senior Backend',
  junior: 'Junior',
  qa: 'QA',
  architect: 'Architect',
  senior_frontend: 'Senior Frontend',
  devops: 'DevOps',
  intern: 'Intern',
});

function listHrRoleCatalog() {
  return DEFAULT_HR_ROLE_KEYS.map((key) => ({
    key,
    kind: ROLE_KIND.HR,
    label: HR_ROLE_LABELS[key] || key,
    grantsPermission: false,
  }));
}

/** jobTitle trên profile = HR Role label/key — không authorize. */
function normalizeHrRoleLabel(raw) {
  return String(raw || '').trim();
}

function assertHrRoleNotForPermission() {
  assertNotHrRoleForPermission(ROLE_KIND.HR);
}

module.exports = {
  listHrRoleCatalog,
  normalizeHrRoleLabel,
  HR_ROLE_LABELS,
  assertHrRoleNotForPermission,
};
