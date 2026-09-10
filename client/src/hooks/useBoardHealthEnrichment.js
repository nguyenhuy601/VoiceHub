import { useEffect, useMemo, useState } from 'react';
import {
  taskAPI,
  unwrapTaskBoardDetailPayload,
} from '../services/api/taskAPI';
import {
  applyBoardDetailRefs,
  enrichBoardHealthList,
  projectRefFromBoardDetailPayload,
} from '../utils/mapBoardHealthToProject';

const MAX_DETAIL_FETCH = 5;

/**
 * Enrich board health: ưu tiên field BE, rồi map từ projects list,
 * chỉ getBoardDetail cho board vẫn thiếu projectId (max 5).
 * Chờ projects list xong (hoặc không bật list) trước khi detail-fetch — tránh race map FE.
 */
export default function useBoardHealthEnrichment(boards, projects, options = {}) {
  const enabled = options.enabled !== false;
  const organizationId = String(options.organizationId || '').trim();
  /** true = đang tải list projects; false = xong / không dùng list */
  const projectsLoading = Boolean(options.projectsLoading);

  const fromProjects = useMemo(() => {
    if (!enabled) return [];
    return enrichBoardHealthList(boards || [], projects || []);
  }, [enabled, boards, projects]);

  const unresolvedKey = useMemo(() => {
    if (!enabled || projectsLoading) return '';
    return fromProjects
      .filter((b) => !String(b?.projectId || '').trim())
      .map((b) => String(b?.id || b?._id || '').trim())
      .filter(Boolean)
      .slice(0, MAX_DETAIL_FETCH)
      .join(',');
  }, [enabled, projectsLoading, fromProjects]);

  const [detailByBoardId, setDetailByBoardId] = useState({});

  useEffect(() => {
    if (!enabled || !unresolvedKey) {
      setDetailByBoardId({});
      return undefined;
    }
    const ids = unresolvedKey.split(',').filter(Boolean);
    let cancelled = false;

    (async () => {
      const pairs = await Promise.all(
        ids.map(async (boardId) => {
          try {
            const res = await taskAPI.getBoardDetail(boardId, {
              includeCards: false,
              ...(organizationId ? { organizationId } : {}),
            });
            const payload = unwrapTaskBoardDetailPayload(res);
            const ref = projectRefFromBoardDetailPayload(payload);
            return [boardId, ref];
          } catch {
            return [boardId, null];
          }
        })
      );
      if (cancelled) return;
      const next = {};
      pairs.forEach(([id, ref]) => {
        next[id] = ref;
      });
      setDetailByBoardId(next);
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, unresolvedKey, organizationId]);

  return useMemo(
    () => applyBoardDetailRefs(fromProjects, detailByBoardId),
    [fromProjects, detailByBoardId]
  );
}
