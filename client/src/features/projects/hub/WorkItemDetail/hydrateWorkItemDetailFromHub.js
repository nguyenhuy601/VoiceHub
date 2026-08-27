/**
 * Hydrate đủ context cho WorkItemDetail khi mở từ Chat/preview
 * (cùng shape props như ProjectHubShell).
 */
import { projectAPI } from '../../../../services/api/projectAPI';
import {
  taskAPI,
  unwrapTaskApiPayload,
  unwrapTaskBoardDetailPayload,
} from '../../../../services/api/taskAPI';
import { unwrapPlanningList } from '../projectHubUtils';
import {
  findBoardCardById,
  pickPlanningEpicsAndFeatures,
} from './hydrateWorkItemDetailHelpers';

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
 * @param {string} opts.entityId - TaskBoardCard id
 * @param {string} [opts.projectId]
 * @param {string} [opts.boardId]
 * @param {object} [opts.stub] - preview stub (title/status…)
 * @param {object} [opts.apiCtx]
 * @returns {Promise<{
 *   workItem: object,
 *   boardCards: object[],
 *   lists: object[],
 *   epics: object[],
 *   features: object[],
 *   sprints: object[],
 *   boardId: string,
 *   projectId: string,
 *   projectCode: string,
 * }>}
 */
export async function hydrateWorkItemDetailFromHub({
  entityId,
  projectId = '',
  boardId = '',
  stub = null,
  apiCtx = null,
} = {}) {
  const id = relId(entityId);
  let pid = String(projectId || '').trim();
  let bid = String(boardId || '').trim();
  const ctx = apiCtx && typeof apiCtx === 'object' ? apiCtx : {};

  if (!bid && pid) {
    try {
      const boardsRes = await projectAPI.listBoards(pid, ctx.organizationId || undefined);
      const boards = asList(unwrapTaskApiPayload(boardsRes));
      const main = boards.find((b) => b && b.isActive !== false) || boards[0];
      bid = relId(main?._id || main?.id);
    } catch {
      /* keep empty */
    }
  }

  const [boardRes, planningRes, sprintRes] = await Promise.all([
    bid
      ? taskAPI.getBoardDetail(bid, { ...ctx, skipNotFoundToast: true })
      : Promise.resolve(null),
    pid ? projectAPI.listPlanningItems(pid) : Promise.resolve(null),
    pid ? projectAPI.listSprints(pid) : Promise.resolve(null),
  ]);

  const detail = boardRes ? unwrapTaskBoardDetailPayload(boardRes) : null;
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

  const planningItems = planningRes ? unwrapPlanningList(planningRes) : [];
  const { epics, features } = pickPlanningEpicsAndFeatures(planningItems);
  const sprints = sprintRes ? unwrapPlanningList(sprintRes) : [];

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
    sprints,
    boardId: bid,
    projectId: pid,
    projectCode,
  };
}
