import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { analysisAPI } from '../../../../services/api/analysisAPI';
import { useAppStrings } from '../../../../locales/appStrings';
import { resolveApiErrorMessage } from '../../../../utils/resolveApiErrorMessage';
import useProjectCapabilities from '../hooks/useProjectCapabilities';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

export default function TraceabilityPage({ projectId, readOnly = false }) {
  const { t } = useAppStrings();
  const queryClient = useQueryClient();
  const { capabilities } = useProjectCapabilities(projectId);

  const { data: gaps } = useQuery({
    queryKey: ['projectAnalysisGaps', String(projectId || '')],
    queryFn: async () => unwrap(await analysisAPI.getGaps(projectId)),
    enabled: Boolean(projectId),
  });

  const { data: links = [] } = useQuery({
    queryKey: ['analysisTraceLinks', projectId],
    queryFn: async () => {
      const raw = unwrap(await analysisAPI.listTraceLinks(projectId));
      return Array.isArray(raw) ? raw : [];
    },
    enabled: Boolean(projectId),
  });

  const { data: frs = [] } = useQuery({
    queryKey: ['analysisArtifacts', projectId, 'FR'],
    queryFn: async () => {
      const raw = unwrap(await analysisAPI.listArtifacts(projectId, { kind: 'FR' }));
      return Array.isArray(raw) ? raw : [];
    },
    enabled: Boolean(projectId),
  });

  const { data: ucs = [] } = useQuery({
    queryKey: ['analysisArtifacts', projectId, 'UC'],
    queryFn: async () => {
      const raw = unwrap(await analysisAPI.listArtifacts(projectId, { kind: 'UC' }));
      return Array.isArray(raw) ? raw : [];
    },
    enabled: Boolean(projectId),
  });

  const linkMut = useMutation({
    mutationFn: (body) => analysisAPI.createTraceLink(projectId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['analysisTraceLinks', projectId] });
      queryClient.invalidateQueries({ queryKey: ['projectAnalysisGaps', String(projectId)] });
      toast.success(t('workspace.phase1LinkCreated'));
    },
    onError: (err) => toast.error(resolveApiErrorMessage(err)),
  });

  const canLink = capabilities.canEditAnalysis && !readOnly;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3 sm:p-4">
      <h1 className="text-lg font-semibold">{t('workspace.phaseNavTraceability')}</h1>

      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
        <h2 className="text-sm font-semibold">{t('workspace.phase1Gaps')}</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {(gaps?.frMissingUc || []).map((g) => (
            <li key={g.id}>
              {t('workspace.phase1GapFrMissingUc', {
                key: g.externalKey,
                title: g.title,
              })}
            </li>
          ))}
          {(gaps?.brMissingBg || []).map((g) => (
            <li key={g.id}>
              {t('workspace.phase1GapBrMissingBg', {
                key: g.externalKey,
                title: g.title,
              })}
            </li>
          ))}
          {!gaps?.frMissingUc?.length && !gaps?.brMissingBg?.length ? (
            <li className="text-muted-foreground">{t('workspace.phase1NoGaps')}</li>
          ) : null}
        </ul>
      </div>

      <div className="rounded-xl border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold">{t('workspace.phase1FrToUc')}</h2>
        <ul className="mt-3 space-y-3">
          {frs.map((fr) => {
            const frId = String(fr.id || fr._id);
            const linked = links.filter(
              (l) =>
                l.linkType === 'implements' &&
                (String(l.toArtifactId) === frId || String(l.fromArtifactId) === frId)
            );
            return (
              <li key={frId} className="rounded-lg border border-border/60 p-3 text-sm">
                <p className="font-medium">
                  <span className="font-mono text-xs">{fr.externalKey}</span> {fr.title}
                </p>
                <ul className="mt-1 list-inside list-disc text-muted-foreground">
                  {linked.map((l) => (
                    <li key={l.id || l._id}>{String(l.fromArtifactId)} → {String(l.toArtifactId)}</li>
                  ))}
                  {!linked.length ? <li>{t('workspace.phase1NoLinks')}</li> : null}
                </ul>
                {canLink && ucs.length ? (
                  <select
                    className="mt-2 rounded border border-border bg-background px-2 py-1 text-xs"
                    defaultValue=""
                    onChange={(e) => {
                      const ucId = e.target.value;
                      e.target.value = '';
                      if (!ucId) return;
                      linkMut.mutate({
                        fromArtifactId: ucId,
                        toArtifactId: frId,
                        linkType: 'implements',
                      });
                    }}
                  >
                    <option value="">{t('workspace.phase1LinkUc')}</option>
                    {ucs.map((u) => (
                      <option key={u.id || u._id} value={String(u.id || u._id)}>
                        {u.externalKey} — {u.title}
                      </option>
                    ))}
                  </select>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
