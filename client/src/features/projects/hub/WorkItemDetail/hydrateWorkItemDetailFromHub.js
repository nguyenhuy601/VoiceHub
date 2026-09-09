import { projectAPI } from '../../../../services/api/projectAPI';
import {
  unwrapTaskApiPayload,
} from '../../../../services/api/taskAPI';
import { queryKeys } from '../../../../lib/queryKeys';
import {
  findBoardCardById,
  pickPlanningEpicsAndFeatures,
} from './hydrateWorkItemDetailHelpers';
import {
  ensureProjectHubBoards,
  fetchProjectHubBoardDetail,
  fetchProjectHubPlanningItems,
  fetchProjectHubSprints,
  unwrapProjectPayload,
} from '../useProjectHubQueries';
import { resolveHubCapabilities } from '../hubCaps';

function asList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function relId(value) {
  if (value == null) return '';
  if (typeof value === 'object') return String(value._id || value.id || '').trim();
  return String(value).trim();
}

/**
 * @param {object} opts
 * @param {import('@tanstack/react-query').QueryClient} [opts.queryClient]
 * @param {string} opts.entityId - TaskBoardCard id
 * @param {string} [opts.projectId]
 * @param {string} [opts.boardId]
 * @param {object} [opts.stub] - preview stub (title/status…)
 * @param {object} [opts.apiCtx]
 * @param {boolean} [opts.canViewBacklog]
 * @param {boolean} [opts.canViewSprints]
 */
export async function hydrateWorkItemDetailFromHub({
  queryClient = null,
  entityId,
  projectId = '',
  boardId = '',
  stub = null,
  apiCtx = null,
  canViewBacklog,
  canViewSprints,
} = {}) {
  const id = relId(entityId);
  let pid = String(projectId || '').trim();
  let bid = String(boardId || '').trim();
  const ctx = apiCtx && typeof apiCtx === 'object' ? apiCtx : {};

  if (!bid && pid) {
    try {
      const boards = queryClient
        ? await ensureProjectHubBoards(queryClient, pid, ctx.organizationId || '')
        : asList(
            unwrapTaskApiPayload(
              await projectAPI.listBoards(pid, ctx.organizationId || undefined)
            )
          );
      const main =
        (Array.isArray(boards) ? boards : []).find((b) => b && b.isActive !== false) ||
        boards?.[0];
      bid = relId(main?._id || main?.id);
    } catch {
      /* keep empty */
    }
  }

  const ensure = async (queryKey, queryFn) => {
    if (queryClient && typeof queryClient.ensureQueryData === 'function') {
      return queryClient.ensureQueryData({ queryKey, queryFn, staleTime: 15_000 });
    }
    return queryFn();
  };

  let allowPlanning = canViewBacklog;
  let allowSprints = canViewSprints;
  if (pid && (allowPlanning === undefined || allowSprints === undefined)) {
    try {
      const projectPayload = await ensure(queryKeys.projectHub.project(pid), async () => {
        const res = await projectAPI.get(pid);
        return unwrapProjectPayload(res) || null;
      });
      const caps = resolveHubCapabilities(projectPayload);
      if (allowPlanning === undefined) allowPlanning = Boolean(caps.canViewBacklog);
      if (allowSprints === undefined) allowSprints = Boolean(caps.canViewSprints);
    } catch {
      if (allowPlanning === undefined) allowPlanning = false;
      if (allowSprints === undefined) allowSprints = false;
    }
  }
  if (allowPlanning !== true) allowPlanning = false;
  if (allowSprints !== true) allowSprints = false;

  const [detail, planningItems, sprints] = await Promise.all([
    bid
      ? ensure(queryKeys.projectHub.boardDetail(bid, 'full'), () =>
          fetchProjectHubBoardDetail(bid, { ...ctx, skipNotFoundToast: true }, { includeCards: true })
        )
      : Promise.resolve(null),
    pid && allowPlanning
      ? ensure(queryKeys.projectHub.planningItems(pid), () => fetchProjectHubPlanningItems(pid))
      : Promise.resolve([]),
    pid && allowSprints
      ? ensure(queryKeys.projectHub.sprints(pid), () => fetchProjectHubSprints(pid))
      : Promise.resolve([]),
  ]);

  const board = detail?.board || detail || {};
  const lists = Array.isArray(detail?.lists)
    ? detail.lists
    : Array.isArray(board?.lists)
      ? board.lists
      : [];
  const boardCards = Array.isArray(detail?.cards) ? detail.cards : [];
  if (!pid) pid = relId(board?.projectId || detail?.projectId);
  if (!bid) bid = relId(board?._id || board?.id || detail?.boardId);
  const projectCode = String(board?.projectCode || stub?.project?.projectCode || '').trim();

  const { epics, features } = pickPlanningEpicsAndFeatures(
    Array.isArray(planningItems) ? planningItems : []
  );

  let workItem =
    findBoardCardById(boardCards, id) ||
    (stub && typeof stub === 'object'
      ? {
          _id: id,
          title: stub.title || '',
          issueType: stub.issueType || 'task',
          status: stub.status || '',
          priority: stub.priority || '',
          projectId: pid,
          boardId: bid,
        }
      : null);

  if (!workItem && id) {
    workItem = {
      _id: id,
      title: '',
      issueType: 'task',
      projectId: pid,
      boardId: bid,
    };
  }

  return {
    workItem,
    boardCards,
    lists,
    epics,
    features,
    sprints: Array.isArray(sprints) ? sprints : [],
    boardId: bid,
    projectId: pid,
    projectCode,
  };
}
