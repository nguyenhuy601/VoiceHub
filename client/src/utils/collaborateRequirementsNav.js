/**
 * Collaborate Requirements menu = account Position (jobTitle), not action grants.
 * Mirrors shared/config/requirementAccessPolicy.js defaults (SSOT tested in shared).
 */

import { coalesceJobTitle } from './jobTitleProfile.js';
import { DEFAULT_HR_ROLE_KEYS, DEFAULT_HR_ROLE_LABELS } from './roleTaxonomy.js';

/** Default submitter/approver Position keys with collaborateRequirements: true */
const DEFAULT_COLLABORATE_REQUIREMENTS_POSITION_KEYS = Object.freeze([
  'business_analyst',
  'product_manager',
]);

/** Default approver aliases from requirementAccessPolicy */
const DEFAULT_COLLABORATE_REQUIREMENTS_ALIASES = Object.freeze([
  'product owner',
  'product_owner',
  'project manager',
  'project_manager',
]);

function normalizeJobTitle(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function resolveCanonicalPositionKey(rawKey) {
  const raw = String(rawKey || '').trim().toLowerCase();
  if (!raw) return '';
  if (DEFAULT_HR_ROLE_KEYS.includes(raw)) return raw;
  const slug = raw.replace(/[\s-]+/g, '_').replace(/[^a-z0-9_]/g, '');
  if (DEFAULT_HR_ROLE_KEYS.includes(slug)) return slug;
  return '';
}

/**
 * @param {string} jobTitle
 * @returns {string}
 */
export function resolvePositionKeyFromJobTitle(jobTitle) {
  const raw = normalizeJobTitle(jobTitle);
  if (!raw) return '';

  const canonical = resolveCanonicalPositionKey(raw.replace(/\s+/g, '_'));
  if (canonical) return canonical;

  for (const key of DEFAULT_HR_ROLE_KEYS) {
    const label = normalizeJobTitle(DEFAULT_HR_ROLE_LABELS[key] || '');
    if (label && label === raw) return key;
  }
  for (const key of DEFAULT_HR_ROLE_KEYS) {
    const label = normalizeJobTitle(DEFAULT_HR_ROLE_LABELS[key] || '');
    if (
      (label && (raw.includes(label) || label.includes(raw))) ||
      raw.includes(key.replace(/_/g, ' '))
    ) {
      return key;
    }
  }
  return '';
}

/**
 * @param {{ jobTitle?: string, positionKeys?: string[], aliases?: string[] }} [input]
 * @returns {boolean}
 */
export function shouldShowCollaborateRequirementsNav(input = {}) {
  const jobTitle = String(input.jobTitle || '').trim();
  if (!jobTitle) return false;

  const positionKeys = new Set(
    (Array.isArray(input.positionKeys) && input.positionKeys.length
      ? input.positionKeys
      : DEFAULT_COLLABORATE_REQUIREMENTS_POSITION_KEYS
    )
      .map((k) => String(k || '').trim().toLowerCase())
      .filter(Boolean)
  );
  const aliases = new Set(
    (Array.isArray(input.aliases) && input.aliases.length
      ? input.aliases
      : DEFAULT_COLLABORATE_REQUIREMENTS_ALIASES
    )
      .map((a) => String(a || '').trim().toLowerCase())
      .filter(Boolean)
  );

  const positionKey = resolvePositionKeyFromJobTitle(jobTitle);
  if (positionKey && positionKeys.has(positionKey)) return true;

  const alias = normalizeJobTitle(jobTitle);
  if (aliases.has(alias) || aliases.has(alias.replace(/\s+/g, '_'))) return true;
  return false;
}

/**
 * @param {object|null|undefined} userOrProfile — Auth user / profile with jobTitle or preferences.jobTitle
 * @returns {boolean}
 */
export function shouldShowCollaborateRequirementsNavForUser(userOrProfile) {
  return shouldShowCollaborateRequirementsNav({
    jobTitle: coalesceJobTitle(userOrProfile),
  });
}

export {
  DEFAULT_COLLABORATE_REQUIREMENTS_POSITION_KEYS,
  DEFAULT_COLLABORATE_REQUIREMENTS_ALIASES,
};
