import { useCallback, useEffect, useState } from 'react';
import { taskAPI, unwrapTaskApiPayload } from '../../services/api/taskAPI';

function asBoardList(payload) {
  const data = unwrapTaskApiPayload(payload);
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.boards)) return data.boards;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

/**
 * Danh sách TaskBoard theo org cho admin Tasks domain.
 */
export default function useAdminOrgBoards(orgId) {
  const [boards, setBoards] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadBoards = useCallback(async () => {
    const oid = String(orgId || '').trim();
    if (!oid) {
      setBoards([]);
      return [];
    }
    setLoading(true);
    setError(null);
    try {
      const res = await taskAPI.getBoards({ organizationId: oid });
      const list = asBoardList(res).filter((b) => b && (b.isActive !== false));
      setBoards(list);
      return list;
    } catch (err) {
      setError(err);
      setBoards([]);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    loadBoards().catch(() => {});
  }, [loadBoards]);

  return { boards, loading, error, loadBoards, setBoards };
}

export function boardIdOf(board) {
  return String(board?._id || board?.id || '').trim();
}

export function boardTitleOf(board) {
  return String(board?.title || board?.name || 'Untitled').trim();
}

export function boardCodeOf(board) {
  return String(board?.projectCode || '').trim();
}
