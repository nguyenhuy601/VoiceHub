import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { effortEstimationAPI } from '../../services/api/meetingPlanningAPI';
import { useAppStrings } from '../../locales/appStrings';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

/**
 * Org admin — Effort Estimation Configuration (MEETING activities + publish).
 */
export default function EffortEstimationSettingsPanel({ organizationId }) {
  const { t } = useAppStrings();
  const qc = useQueryClient();
  const orgId = String(organizationId || '').trim();
  const [msg, setMsg] = useState('');

  const publishedQ = useQuery({
    queryKey: ['effortEstimationPublished', orgId],
    queryFn: async () => unwrap(await effortEstimationAPI.getPublished(orgId)),
    enabled: Boolean(orgId),
  });

  const draftQ = useQuery({
    queryKey: ['effortEstimationDraft', orgId],
    queryFn: async () => unwrap(await effortEstimationAPI.getDraft(orgId)),
    enabled: Boolean(orgId),
  });

  const publishM = useMutation({
    mutationFn: async () => unwrap(await effortEstimationAPI.publish(orgId)),
    onSuccess: () => {
      setMsg('Published');
      qc.invalidateQueries({ queryKey: ['effortEstimationPublished', orgId] });
      qc.invalidateQueries({ queryKey: ['effortEstimationDraft', orgId] });
    },
    onError: (e) => setMsg(e?.response?.data?.message || e?.message || 'Publish failed'),
  });

  const published = publishedQ.data;
  const draft = draftQ.data;
  const activities = Array.isArray(draft?.activities)
    ? draft.activities
    : Array.isArray(published?.activities)
      ? published.activities
      : [];

  return (
    <section className="space-y-4 max-w-3xl">
      <div>
        <h2 className="text-base font-semibold">
          {t('workspace.effortEstimationTitle') || 'Effort estimation'}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          {t('workspace.effortEstimationHint') ||
            'Định mức họp theo vai trò (org). Publish trước khi seed MeetingPlan dự án.'}
        </p>
      </div>

      {published?.calculationBasis ? (
        <p className="text-xs rounded-md border border-border px-3 py-2 bg-muted/40">
          Source: {published.calculationBasis.source}
          {published.calculationBasis.warning
            ? ` — ${published.calculationBasis.warning}`
            : ''}
          {published.calculationBasis.ptoExcluded ? ' · PTO excluded (MVP)' : ''}
        </p>
      ) : null}

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="p-2">Activity</th>
              <th className="p-2">Roles</th>
              <th className="p-2">h / unit</th>
              <th className="p-2">units</th>
            </tr>
          </thead>
          <tbody>
            {activities.map((a) => (
              <tr key={a.activityId} className="border-t border-border">
                <td className="p-2">{a.name}</td>
                <td className="p-2">{(a.applicableRoleKeys || []).join(', ')}</td>
                <td className="p-2">{a.effortHoursPerUnit}</td>
                <td className="p-2">{a.unitsPerPeriod}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        className="text-sm px-3 py-2 rounded-md bg-primary text-primary-foreground disabled:opacity-50"
        disabled={!orgId || publishM.isPending}
        onClick={() => publishM.mutate()}
      >
        {t('workspace.effortEstimationPublish') || 'Publish draft'}
      </button>
      {msg ? <p className="text-xs text-muted-foreground">{msg}</p> : null}
    </section>
  );
}
