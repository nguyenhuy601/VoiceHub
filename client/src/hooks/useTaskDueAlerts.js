import { useEffect, useRef } from 'react';

const DONE = new Set(['done', 'cancelled']);

function playDueBeep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.2);
  } catch {
    // ignore
  }
}

function notifyKey(taskId, dueIso) {
  return `calendar:taskNotified:${taskId}:${dueIso}`;
}

/**
 * Phát âm thanh + gọi onAlert khi task đến deadline (một lần mỗi mốc / session).
 * @param {Array<{ raw: object }>} taskEvents — từ useCalendarFeed.tasksForAlerts
 * @param {{ enabled?: boolean, onAlert?: (payload: object) => void }} options
 */
export function useTaskDueAlerts(taskEvents, options = {}) {
  const { enabled = true, onAlert } = options;
  const alertedRef = useRef(new Set());

  useEffect(() => {
    alertedRef.current = new Set(
      Object.keys(sessionStorage)
        .filter((k) => k.startsWith('calendar:taskNotified:'))
        .filter((k) => sessionStorage.getItem(k) === '1')
    );
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;

    const tick = () => {
      const now = Date.now();
      for (const ev of taskEvents) {
        const task = ev.raw;
        if (!task?._id || !task.dueDate) continue;
        if (DONE.has(task.status)) continue;

        const due = new Date(task.dueDate);
        if (Number.isNaN(due.getTime())) continue;

        const dueMs = due.getTime();
        // Cửa sổ 2 phút sau mốc due (một lần / session)
        if (now < dueMs || now >= dueMs + 2 * 60 * 1000) continue;

        const dueIso = due.toISOString();
        const key = notifyKey(task._id, dueIso);
        if (alertedRef.current.has(key)) continue;
        if (sessionStorage.getItem(key) === '1') {
          alertedRef.current.add(key);
          continue;
        }

        sessionStorage.setItem(key, '1');
        alertedRef.current.add(key);
        playDueBeep();
        if (onAlert) {
          onAlert({ task, title: task.title || 'Task', due });
        }
      }
    };

    tick();
    const id = window.setInterval(tick, 15000);
    return () => window.clearInterval(id);
  }, [enabled, taskEvents, onAlert]);
}
