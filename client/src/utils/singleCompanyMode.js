const SINGLE_ORG_FLAG_KEY = 'voicehub:single-org-mode';
const COMPANY_SNAPSHOT_KEY = 'voicehub:company-snapshot';

export function readSingleOrgModeFlag() {
  if (typeof window === 'undefined') return false;
  const stored = window.sessionStorage.getItem(SINGLE_ORG_FLAG_KEY);
  if (stored === '1') return true;
  if (stored === '0') return false;
  return import.meta.env.VITE_SINGLE_ORG_MODE === 'true';
}

export function writeBootstrapCompanyFlags(bootstrap) {
  if (typeof window === 'undefined' || !bootstrap) return;
  const single = Boolean(bootstrap.singleOrgMode);
  window.sessionStorage.setItem(SINGLE_ORG_FLAG_KEY, single ? '1' : '0');
  if (bootstrap.company) {
    window.sessionStorage.setItem(COMPANY_SNAPSHOT_KEY, JSON.stringify(bootstrap.company));
  }
}

export function readCompanySnapshot() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(COMPANY_SNAPSHOT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function resolveCompanyFromBootstrap(bootstrap) {
  if (!bootstrap || typeof bootstrap !== 'object') return null;
  if (bootstrap.company && (bootstrap.company.id || bootstrap.company._id)) {
    return bootstrap.company;
  }
  const orgs = Array.isArray(bootstrap.organizations) ? bootstrap.organizations : [];
  return orgs.length > 0 ? orgs[0] : null;
}
