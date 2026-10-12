import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { meetingPlanningAPI } from '../../../services/api/meetingPlanningAPI';
import { useAppStrings } from '../../../locales/appStrings';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

/**
 * G1 — list / create / cancel MeetingEvent (manual).
 */
export default function ProjectMeetingsPanel({ projectId }) {
  const { t } = useAppStrings();
  const qc = useQueryClient();
  const [title, setTitle] = useState('Project sync');
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [msg, setMsg] = useState('');

  const listQ = useQuery({
    queryKey: ['meetingEvents', projectId],
    queryFn: async () => {
      const raw = unwrap(await meetingPlanningAPI.listEvents(projectId));
      return Array.isArray(raw) ? raw : [];
    },
    enabled: Boolean(projectId),
  });

  const createM = useMutation({
    mutationFn: async () => {
      const body = {
        title,
        startAt: new Date(startAt).toISOString(),
        endAt: new Date(endAt).toISOString(),
        participants: [],
        customerExchangeStatus: 'n_a',
        exceedPlanAck: true,
        overrideReason: 'FE create with ack',
        conflictOverrideReason: 'FE create with ack',
      };
      const res = await meetingPlanningAPI.createEvent(projectId, body);
      if (res?.status === 409 || res?.data?.success === false) {
        const d = res?.data?.data;
        throw Object.assign(new Error(d?.message || 'Requires ack'), { data: d });
      }
      return unwrap(res);
    },
    onSuccess: () => {
      setMsg('');
      qc.invalidateQueries({ queryKey: ['meetingEvents', projectId] });
    },
    onError: (e) => setMsg(e?.message || 'Create failed'),
  });

  const cancelM = useMutation({
    mutationFn: async (eventId) =>
      unwrap(
        await meetingPlanningAPI.cancelEvent(projectId, eventId, {
          disposition: 'return_forecast',
          reason: 'Cancelled from hub',
        })
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['meetingEvents', projectId] }),
  });

  const events = listQ.data || [];

  return (
    <section className="rounded-lg border border-border bg-card p-4 space-y-4">
      <div>
        <h3 className="text-sm font-semibold">
          {t('workspace.projectMeetingsTitle') || 'Project meetings'}
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          {t('workspace.projectMeetingsHint') ||
            'Lịch cụ thể — tách khỏi MeetingPlan forecast và Task.'}
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-3 text-xs">
        <label className="flex flex-col gap-1">
          Title
          <input
            className="border border-border rounded px-2 py-1 bg-background"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1">
          Start
          <input
            type="datetime-local"
            className="border border-border rounded px-2 py-1 bg-background"
            value={startAt}
            onChange={(e) => setStartAt(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1">
          End
          <input
            type="datetime-local"
            className="border border-border rounded px-2 py-1 bg-background"
            value={endAt}
            onChange={(e) => setEndAt(e.target.value)}
          />
        </label>
      </div>
      <button
        type="button"
        className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground disabled:opacity-50"
        disabled={!startAt || !endAt || createM.isPending}
        onClick={() => createM.mutate()}
      >
        {t('workspace.projectMeetingsCreate') || 'Create meeting'}
      </button>
      {msg ? <p className="text-xs text-destructive">{msg}</p> : null}

      <ul className="divide-y divide-border text-xs">
        {listQ.isLoading ? (
          <li className="flex items-center gap-2 py-2 text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            <span>{t('common.loading')}</span>
          </li>
        ) : events.length === 0 ? (
          <li className="py-2 text-muted-foreground">
            {t('workspace.projectMeetingsEmpty') || 'No meetings yet'}
          </li>
        ) : (
          events.map((ev) => (
            <li key={ev.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-medium">{ev.title}</div>
                <div className="text-muted-foreground">
                  {ev.status} · {ev.customerExchangeStatus} ·{' '}
                  {ev.startAt ? new Date(ev.startAt).toLocaleString() : ''}
                </div>
              </div>
              {ev.status !== 'cancelled' && ev.status !== 'completed' ? (
                <button
                  type="button"
                  className="text-destructive underline"
                  onClick={() => cancelM.mutate(ev.id)}
                >
                  Cancel
                </button>
              ) : null}
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
