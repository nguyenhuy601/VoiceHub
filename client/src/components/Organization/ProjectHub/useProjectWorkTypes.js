import { useCallback, useEffect, useState } from 'react';
import {
  WORK_TYPE_CHANGE_EVENT,
  loadWorkTypeConfig,
  saveWorkTypeConfig,
  workTypeStorageKey,
} from './projectWorkTypes';

/**
 * Cấu hình Work types theo projectId — đồng bộ Settings ↔ thanh tạo (cùng tab + storage).
 */
export function useProjectWorkTypes(projectId) {
  const id = String(projectId || '').trim();
  const [config, setConfig] = useState(() => loadWorkTypeConfig(id));

  useEffect(() => {
    setConfig(loadWorkTypeConfig(id));
  }, [id]);

  useEffect(() => {
    const onChange = (event) => {
      const pid = String(event?.detail?.projectId || '');
      if (!id || pid !== id) return;
      setConfig(event.detail?.config || loadWorkTypeConfig(id));
    };
    const onStorage = (event) => {
      if (!id || event.key !== workTypeStorageKey(id)) return;
      setConfig(loadWorkTypeConfig(id));
    };
    window.addEventListener(WORK_TYPE_CHANGE_EVENT, onChange);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(WORK_TYPE_CHANGE_EVENT, onChange);
      window.removeEventListener('storage', onStorage);
    };
  }, [id]);

  const updateConfig = useCallback(
    (next) => {
      const base = loadWorkTypeConfig(id);
      const payload = typeof next === 'function' ? next(base) : next;
      const saved = saveWorkTypeConfig(id, payload);
      setConfig(saved);
      return saved;
    },
    [id]
  );

  return { config, updateConfig };
}
