import { useEffect, useRef } from 'react';

const STORAGE_PREFIX = 'vh-sprint-due-prompt:';
const POLL_MS = 20_000;

function promptKey(sprintId) {
  return `${STORAGE_PREFIX}${String(sprintId || '')}`;
}

function isActiveAutoCompleteDue(sprint, nowMs) {
  if (!sprint) return false;
  if (!sprint.autoComplete) return false;
  const status = String(sprint.status || sprint.state || '').toLowerCase();
  if (status !== 'active') return false;
  if (!sprint.endDate) return false;
  const end = new Date(sprint.endDate);
  if (Number.isNaN(end.getTime())) return false;
  return nowMs >= end.getTime();
}

/**
 * Khi sprint active + autoComplete và đã tới/qua endDate → gọi onPromptComplete một lần / session.
 * Không tự complete — chỉ mở modal xác nhận.
 */
export function useSprintAutoCompletePrompt(sprints, options = {}) {
  const { enabled = true, onPromptComplete } = options;
  const promptedRef = useRef(new Set());
  const onPromptRef = useRef(onPromptComplete);
  onPromptRef.current = onPromptComplete;

  useEffect(() => {
    const keys = Object.keys(sessionStorage).filter((k) => k.startsWith(STORAGE_PREFIX));
    promptedRef.current = new Set(keys.filter((k) => sessionStorage.getItem(k) === '1'));
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;

    const tick = () => {
      const now = Date.now();
      const list = Array.isArray(sprints) ? sprints : [];
      for (const sprint of list) {
        const sprintId = String(sprint?._id || sprint?.id || '').trim();
        if (!sprintId) continue;
        if (!isActiveAutoCompleteDue(sprint, now)) continue;

        const key = promptKey(sprintId);
        if (promptedRef.current.has(key)) continue;
        if (sessionStorage.getItem(key) === '1') {
          promptedRef.current.add(key);
          continue;
        }

        sessionStorage.setItem(key, '1');
        promptedRef.current.add(key);
        onPromptRef.current?.(sprintId);
        // Chỉ mở một modal mỗi tick.
        break;
      }
    };

    tick();
    const id = window.setInterval(tick, POLL_MS);
    return () => window.clearInterval(id);
  }, [enabled, sprints]);
}

export default useSprintAutoCompletePrompt;
