/**
 * Resolve requirement pack linked to a project (for AI HITL entry guards).
 */

import { requirementAPI } from '../../../../services/api/requirementAPI';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

function packProjectId(pack) {
  const raw = pack?.projectId;
  if (raw && typeof raw === 'object') return String(raw._id || raw.id || '').trim();
  return String(raw || '').trim();
}

/**
 * @returns {Promise<object|null>} pack summary (list row or full) or null
 */
export async function loadLinkedPackForAiNav(organizationId, projectId) {
  const orgId = String(organizationId || '').trim();
  const pid = String(projectId || '').trim();
  if (!orgId || !pid) return null;

  const listed = unwrap(await requirementAPI.listPacks(orgId, {}));
  const list = Array.isArray(listed) ? listed : listed?.items || listed?.packs || [];
  const hit = list.find((pack) => packProjectId(pack) === pid) || null;
  if (!hit) return null;

  const listedMode = String(hit?.overview?.analysisMode || hit?.analysisMode || '')
    .trim()
    .toLowerCase();
  if (listedMode === 'ai' || listedMode === 'manual') return hit;

  // List may omit analysisMode — fetch full only when still deciding AI vs manual
  const packId = String(hit?._id || hit?.id || '').trim();
  if (!packId) return hit;
  try {
    const full = unwrap(await requirementAPI.getPack(orgId, packId, { view: 'full' }));
    return full || hit;
  } catch {
    return hit;
  }
}
