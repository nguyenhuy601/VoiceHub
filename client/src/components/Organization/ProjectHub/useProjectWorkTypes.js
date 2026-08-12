import { useCallback, useEffect, useState } from 'react';
import { projectAPI } from '../../../services/api/projectAPI';
import {
  WORK_TYPE_CHANGE_EVENT,
  loadWorkTypeConfig,
  normalizeWorkTypeConfig,
  saveWorkTypeConfig,
  workTypeStorageKey,
} from './projectWorkTypes';

function unwrapProject(res) {
  return res?.data?.data ?? res?.data ?? res ?? null;
}

function hasServerConfig(raw) {
  return Boolean(raw && typeof raw === 'object');
}

/**
 * Work types theo projectId — SSOT Project.workTypeConfig (serverConfig từ Shell), cache localStorage.
 */
export function useProjectWorkTypes(projectId, { serverConfig } = {}) {
  const id = String(projectId || '').trim();
  const [config, setConfig] = useState(() =>
    hasServerConfig(serverConfig)
      ? normalizeWorkTypeConfig(serverConfig)
      : loadWorkTypeConfig(id)
  );

  useEffect(() => {
    if (!id) {
      setConfig(loadWorkTypeConfig(''));
      return undefined;
    }
    if (hasServerConfig(serverConfig)) {
      setConfig(saveWorkTypeConfig(id, serverConfig));
      return undefined;
    }
    let cancelled = false;
    setConfig(loadWorkTypeConfig(id));
    (async () => {
      try {
        const res = await projectAPI.get(id);
        const raw = unwrapProject(res)?.workTypeConfig;
        if (cancelled) return;
        if (raw && typeof raw === 'object') {
          setConfig(saveWorkTypeConfig(id, raw));
        } else {
          setConfig(loadWorkTypeConfig(id));
        }
      } catch {
        if (!cancelled) setConfig(loadWorkTypeConfig(id));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, serverConfig]);

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
      if (id) {
        void projectAPI.patch(id, { workTypeConfig: saved }).catch(() => {
          /* cache local giữ; GET sau có thể ghi đè từ server */
        });
      }
      return saved;
    },
    [id]
  );

  return { config, updateConfig };
}
