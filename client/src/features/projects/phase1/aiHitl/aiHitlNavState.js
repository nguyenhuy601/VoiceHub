/**
 * AI HITL navigation — incomplete AI draft stays on /ai-hitl (Phase 0 in suite shell);
 * after Gate2 promote → Phase 2 board.
 */

import { buildProjectsAiHitlPath, buildProjectsModulePath } from '../../../../utils/suitePathUtils.js';
import { phaseHomeModule } from '../../../../utils/projectPhaseNav.js';

const PROMOTED_PHASES = new Set(['delivery_planning', 'development', 'qa_uat', 'release_handover']);
const PROMOTED_STATUSES = new Set(['in_development', 'active', 'qa_uat', 'release_handover', 'on_hold']);
const DRAFT_LIKE_STATUSES = new Set(['draft', 'ready', 'planning', 'new', 'created', '']);

function norm(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function packAnalysisMode(pack) {
  return norm(pack?.overview?.analysisMode || pack?.analysisMode);
}

function packStatus(pack) {
  return norm(pack?.status);
}

function linkedPackId(pack) {
  return String(pack?._id || pack?.id || '').trim();
}

/**
 * True when AI project should stay on HITL (not Phase1 RA shell).
 * @param {{ project?: object|null, pack?: object|null, assumeAi?: boolean }} args
 */
export function isAiHitlIncomplete({ project = null, pack = null, assumeAi = false } = {}) {
  const phase = norm(project?.deliveryPhase);
  const status = norm(project?.status);
  const packSt = packStatus(pack);
  // Prefer pack overview; fall back to Project.analysisMode (persisted at birth).
  const mode = packAnalysisMode(pack) || norm(project?.analysisMode);

  if (PROMOTED_PHASES.has(phase)) return false;
  if (PROMOTED_STATUSES.has(status)) return false;
  if (packSt === 'project_linked') return false;

  const isAi = mode === 'ai' || (assumeAi && mode !== 'manual');
  if (!isAi) return false;

  // Still in RA draft lifecycle (empty phase treated as RA for AI drafts)
  if (phase && phase !== 'requirement_analysis') return false;
  if (status && !DRAFT_LIKE_STATUSES.has(status)) return false;

  return true;
}

/**
 * Resolve entry URL for a project (picker / deep open).
 * @returns {string} path
 */
export function resolveAiProjectEntryPath({
  projectId,
  project = null,
  pack = null,
  boardId = '',
  organizationId = '',
  assumeAi = false,
} = {}) {
  const pid = String(projectId || project?._id || project?.projectId || '').trim();
  if (!pid) return '/app/projects';

  const bid = String(boardId || project?.defaultBoardId || '').trim();
  const incomplete = isAiHitlIncomplete({ project, pack, assumeAi });

  if (incomplete) {
    return buildProjectsAiHitlPath(pid, {
      boardId: bid,
      packId: linkedPackId(pack),
    });
  }

  const home = phaseHomeModule(project?.deliveryPhase);
  return buildProjectsModulePath(pid, home, {
    organizationId,
    boardId: bid,
  });
}

/**
 * Path after HITL promote / when leaving HITL because ready.
 */
export function resolvePostHitlProjectPath({ projectId, project = null, boardId = '' } = {}) {
  const pid = String(projectId || project?._id || project?.projectId || '').trim();
  if (!pid) return '/app/projects';
  const bid = String(boardId || project?.defaultBoardId || '').trim();
  // RULE-04: after promote → Phase 2 home
  const phase = norm(project?.deliveryPhase) || 'development';
  const home = phaseHomeModule(PROMOTED_PHASES.has(phase) ? phase : 'development');
  return buildProjectsModulePath(pid, home, { boardId: bid });
}

export function resolveHitlBackPath({
  projectId,
  project = null,
  pack = null,
  boardId = '',
  assumeAi = true,
} = {}) {
  const incomplete = isAiHitlIncomplete({ project, pack, assumeAi });
  if (incomplete) {
    return '/app/projects';
  }
  return resolvePostHitlProjectPath({ projectId, project, boardId });
}
