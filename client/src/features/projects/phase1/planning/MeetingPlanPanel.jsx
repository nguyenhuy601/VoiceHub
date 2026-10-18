import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { meetingPlanningAPI } from '../../../../services/api/meetingPlanningAPI';
import { useAppStrings } from '../../../../locales/appStrings';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

/**
 * G1 — MeetingPlan seed / view (forecast hours by week × role).
 * Commitment % stays on ProjectMember — not edited here.
 */
export default function MeetingPlanPanel({ projectId }) {
  const { t } = useAppStrings();
  const qc = useQueryClient();
  const [err, setErr] = useState('');

  const planQ = useQuery({
    queryKey: ['meetingPlan', projectId],
    queryFn: async () => unwrap(await meetingPlanningAPI.getPlan(projectId)),
    enabled: Boolean(projectId),
  });

  const seedM = useMutation({
    mutationFn: async () => unwrap(await meetingPlanningAPI.seedPlan(projectId)),
    onSuccess: () => {
      setErr('');
      qc.invalidateQueries({ queryKey: ['meetingPlan', projectId] });
    },
    onError: (e) => setErr(e?.response?.data?.message || e?.message || 'Seed failed'),
  });

  const confirmM = useMutation({
    mutationFn: async () => unwrap(await meetingPlanningAPI.confirmPlan(projectId)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['meetingPlan', projectId] }),
    onError: (e) => setErr(e?.response?.data?.message || e?.message || 'Confirm failed'),
  });

  const plan = planQ.data?.plan || planQ.data;
  const lines = Array.isArray(plan?.lines) ? plan.lines : [];
  const byRole = useMemo(() => {
    const m = {};
    for (const l of lines) {
      const k = l.roleKey || 'role';
      m[k] = (m[k] || 0) + (Number(l.hours) || 0);
    }
    return m;
  }, [lines]);

  return (
    <section className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            {t('workspace.meetingPlanTitle')}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t('workspace.meetingPlanHint')}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted"
            disabled={seedM.isPending}
            onClick={() => seedM.mutate()}
          >
            {t('workspace.meetingPlanSeed')}
          </button>
          <button
            type="button"
            className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground"
            disabled={confirmM.isPending || !plan?.id}
            onClick={() => confirmM.mutate()}
          >
            {t('workspace.meetingPlanConfirm')}
          </button>
        </div>
      </div>
      {err ? <p className="text-xs text-destructive">{err}</p> : null}
      {planQ.isLoading ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          <span>{t('common.loading')}</span>
        </p>
      ) : !plan?.id ? (
        <p className="text-xs text-muted-foreground">
          {t('workspace.meetingPlanEmpty')}
        </p>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            v{plan.version} · {plan.status} · {lines.length} lines · TZ {plan.timezone}
          </p>
          <ul className="text-xs grid gap-1 sm:grid-cols-2">
            {Object.entries(byRole).map(([role, hours]) => (
              <li key={role} className="flex justify-between border-b border-border/60 py-1">
                <span>{role}</span>
                <span className="font-medium">{hours}h total</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
