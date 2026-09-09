import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAppStrings } from '../locales/appStrings';
import { resolveApiErrorMessage } from '../utils/resolveApiErrorMessage';
import { taskAPI, unwrapTaskApiPayload } from '../services/api/taskAPI';
import { meetingAPI } from '../services/api/meetingAPI';
import { queryKeys } from '../lib/queryKeys';
import { STALE_TIME_CALENDAR_MS } from '../lib/queryClient';
import {
  endOfMonth,
  mapMeetingToCalendarEvent,
  mapTaskToCalendarEvent,
  mapTasksToWorkCalendarEvents,
  mergeAndSortCalendarEvents,
  startOfMonth,
  toDateKey,
} from '../utils/calendarUtils';

const LOCAL_STORAGE_LEGACY = 'calendar:events';
const LOCAL_STORAGE_CUSTOM = 'voicehub:calendar:localCustom';

function migrateLegacyLocal() {
  try {
    const legacy = localStorage.getItem(LOCAL_STORAGE_LEGACY);
    if (!legacy) return;
    if (localStorage.getItem(LOCAL_STORAGE_CUSTOM)) return;
    localStorage.setItem(LOCAL_STORAGE_CUSTOM, legacy);
  } catch {
    /* ignore */
  }
}

function loadLocalCustomEvents() {
  migrateLegacyLocal();
  try {
    const raw =
      localStorage.getItem(LOCAL_STORAGE_CUSTOM) || localStorage.getItem(LOCAL_STORAGE_LEGACY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((e) => ({
      ...e,
      kind: e.kind || 'local',
      source: 'local',
      startAt: e.startAt ? new Date(e.startAt) : null,
    }));
  } catch {
    return [];
  }
}

function unwrapMeetingsPayload(res) {
  const payload = unwrapTaskApiPayload(res) ?? res;
  if (Array.isArray(payload?.meetings)) return payload.meetings;
  if (Array.isArray(payload?.data?.meetings)) return payload.data.meetings;
  if (Array.isArray(payload)) return payload;
  return [];
}

function unwrapTasksPayload(res) {
  const payload = unwrapTaskApiPayload(res) ?? res;
  if (Array.isArray(payload?.tasks)) return payload.tasks;
  if (Array.isArray(payload?.data?.tasks)) return payload.data.tasks;
  if (Array.isArray(payload)) return payload;
  return [];
}

function yearMonthKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Feed lịch: task + meeting (API) trong tháng của selectedDate, + sự kiện local (merge).
 * TanStack Query — staleTime 45s; không refetch on window focus.
 */
export function useCalendarFeed(selectedDate, organizationId = '') {
  const { t } = useAppStrings();
  const [localEvents, setLocalEvents] = useState([]);

  const ym = yearMonthKey(selectedDate);
  const range = useMemo(() => {
    const from = startOfMonth(selectedDate);
    const to = endOfMonth(selectedDate);
    return { from, to };
  }, [selectedDate]);

  const loadLocal = useCallback(() => {
    setLocalEvents(loadLocalCustomEvents());
  }, []);

  const query = useQuery({
    queryKey: queryKeys.calendar.feed(ym, organizationId || ''),
    queryFn: async () => {
      const dueFrom = range.from.toISOString();
      const dueTo = range.to.toISOString();
      const filters = {
        dueFrom,
        dueTo,
        view: 'calendar',
        limit: 200,
      };
      if (organizationId) filters.organizationId = organizationId;

      const [tRes, mRes] = await Promise.all([
        taskAPI.getTasks(filters),
        meetingAPI.getMeetings({
          startFrom: dueFrom,
          startTo: dueTo,
          ...(organizationId ? { organizationId } : {}),
        }),
      ]);

      const tasks = unwrapTasksPayload(tRes);
      const meetings = unwrapMeetingsPayload(mRes);

      const mapped = [];
      const withEstimate = [];
      const withoutEstimate = [];
      for (const task of tasks) {
        const hours = Number(task?.estimateHours);
        if (Number.isFinite(hours) && hours > 0) withEstimate.push(task);
        else withoutEstimate.push(task);
      }
      mapped.push(...mapTasksToWorkCalendarEvents(withEstimate));
      for (const task of withoutEstimate) {
        const ev = mapTaskToCalendarEvent(task);
        if (ev) mapped.push(ev);
      }
      for (const m of meetings) {
        const ev = mapMeetingToCalendarEvent(m);
        if (ev) mapped.push(ev);
      }
      return mergeAndSortCalendarEvents(mapped);
    },
    staleTime: STALE_TIME_CALENDAR_MS,
    retry: 1,
  });

  useEffect(() => {
    loadLocal();
  }, [loadLocal]);

  const apiEvents = query.data || [];
  const error = query.error
    ? resolveApiErrorMessage(query.error, { t, fallback: t('errors.generic') })
    : null;

  const events = useMemo(() => {
    const localInMonth = localEvents.filter((e) => e.date && String(e.date).startsWith(ym));
    return mergeAndSortCalendarEvents([...apiEvents, ...localInMonth]);
  }, [apiEvents, localEvents, ym]);

  const tasksForAlerts = useMemo(
    () => apiEvents.filter((e) => (e.kind === 'task' || e.kind === 'work') && e.raw),
    [apiEvents]
  );

  const refetch = useCallback(async () => {
    await query.refetch();
  }, [query]);

  return {
    events,
    apiEvents,
    localEvents,
    tasksForAlerts,
    loading: query.isPending || (query.isFetching && !query.data),
    error,
    refetch,
    reloadLocal: loadLocal,
    range,
    toDateKey,
  };
}
