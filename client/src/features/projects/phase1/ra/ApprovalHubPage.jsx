import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { analysisAPI } from '../../../../services/api/analysisAPI';
import { useAppStrings } from '../../../../locales/appStrings';
import { resolveApiErrorMessage } from '../../../../utils/resolveApiErrorMessage';
import useProjectCapabilities from '../hooks/useProjectCapabilities';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

const QUEUE_BY_PERM = [
  { status: 'ba_review', need: 'canReviewAnalysisBa', labelKey: 'workspace.phase1QueueBaReview' },
  { status: 'tech_review', need: 'canReviewAnalysisTech', labelKey: 'workspace.phase1QueueTechReview' },
  { status: 'po_review', need: 'canReviewAnalysisPo', labelKey: 'workspace.phase1QueuePoApproval' },
];

const NEXT = {
  draft: 'ba_review',
  ba_review: 'tech_review',
  tech_review: 'po_review',
  po_review: 'approved',
  rejected: 'draft',
};

export default function ApprovalHubPage({ projectId, readOnly = false }) {
  const { t } = useAppStrings();
  const queryClient = useQueryClient();
  const { capabilities } = useProjectCapabilities(projectId);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['analysisArtifacts', projectId, 'all'],
    queryFn: async () => {
      const raw = unwrap(await analysisAPI.listArtifacts(projectId));
      return Array.isArray(raw) ? raw : [];
    },
    enabled: Boolean(projectId),
  });

  const queues = useMemo(() => {
    return QUEUE_BY_PERM.filter((q) => capabilities[q.need]).map((q) => ({
      ...q,
      items: rows.filter((r) => String(r.status) === q.status),
    }));
  }, [rows, capabilities]);

  const transitionMut = useMutation({
    mutationFn: ({ id, toStatus, note }) =>
      analysisAPI.transitionArtifact(projectId, id, { toStatus, status: toStatus, note }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['analysisArtifacts', projectId] });
      queryClient.invalidateQueries({ queryKey: ['projectAnalysisGaps', String(projectId)] });
      toast.success(t('workspace.phase1TransitionOk'));
    },
    onError: (err) => toast.error(resolveApiErrorMessage(err)),
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3 sm:p-4">
      <h1 className="text-lg font-semibold">{t('workspace.phaseNavAnalysisReviews')}</h1>
      <p className="text-sm text-muted-foreground">{t('workspace.phase1ApprovalHint')}</p>

      {isLoading ? <p className="text-sm text-muted-foreground">{t('common.loading')}</p> : null}

      {!queues.length ? (
        <p className="text-sm text-muted-foreground">{t('workspace.phase1NoReviewPerm')}</p>
      ) : null}

      {queues.map((q) => (
        <div key={q.status} className="rounded-xl border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold">
            {t(q.labelKey)}{' '}
            <span className="text-muted-foreground">({q.items.length})</span>
          </h2>
          <ul className="mt-3 space-y-2">
            {q.items.map((item) => {
              const id = String(item.id || item._id);
              return (
                <li
                  key={id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm"
                >
                  <div>
                    <span className="font-mono text-xs">{item.kind}</span>{' '}
                    <span className="font-mono text-xs text-muted-foreground">{item.externalKey}</span>{' '}
                    {item.title}
                  </div>
                  {!readOnly ? (
                    <div className="flex gap-1">
                      <button
                        type="button"
                        className="rounded border border-border px-2 py-1 text-xs"
                        disabled={transitionMut.isPending}
                        onClick={() =>
                          transitionMut.mutate({
                            id,
                            toStatus: NEXT[item.status] || 'approved',
                          })
                        }
                      >
                        {t('workspace.phase1Approve')}
                      </button>
                      <button
                        type="button"
                        className="rounded border border-destructive/40 px-2 py-1 text-xs text-destructive"
                        disabled={transitionMut.isPending}
                        onClick={() =>
                          transitionMut.mutate({
                            id,
                            toStatus: 'rejected',
                            note: t('workspace.phase1RejectNote'),
                          })
                        }
                      >
                        {t('workspace.phase1Reject')}
                      </button>
                    </div>
                  ) : null}
                </li>
              );
            })}
            {!q.items.length ? (
              <li className="text-sm text-muted-foreground">{t('workspace.phase1QueueEmpty')}</li>
            ) : null}
          </ul>
        </div>
      ))}
    </div>
  );
}
