import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { analysisAPI } from '../../../../services/api/analysisAPI';
import { useAppStrings } from '../../../../locales/appStrings';
import { resolveApiErrorMessage } from '../../../../utils/resolveApiErrorMessage';
import useProjectCapabilities from '../hooks/useProjectCapabilities';
import { kindChipClass, queueCardClass, statusBadgeClass } from '../shared/phase1UiTokens';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

const NEXT = {
  draft: 'ba_review',
  ba_review: 'tech_review',
  tech_review: 'po_review',
  po_review: 'approved',
  rejected: 'draft',
};

function nextSetGate(set) {
  const review = set?.review || {};
  if (!review.ba?.userId) return 'tech_review';
  if (!review.tech?.userId) return 'po_review';
  if (!review.po?.userId) return 'approved';
  return null;
}

export default function ApprovalHubPage({ projectId, readOnly = false }) {
  const { t } = useAppStrings();
  const queryClient = useQueryClient();
  const { capabilities } = useProjectCapabilities(projectId);

  const canSubmitBa =
    Boolean(capabilities.canImportAnalysis) ||
    Boolean(capabilities.canEditAnalysis) ||
    (Array.isArray(capabilities.permissions) &&
      capabilities.permissions.includes('analysis:submit_ba_review'));

  const QUEUE_BY_PERM = useMemo(
    () =>
      [
        {
          status: 'draft',
          need: canSubmitBa,
          labelKey: 'workspace.phase1QueueDraftSubmit',
        },
        {
          status: 'ba_review',
          need: capabilities.canReviewAnalysisBa,
          labelKey: 'workspace.phase1QueueBaReview',
        },
        {
          status: 'tech_review',
          need: capabilities.canReviewAnalysisTech,
          labelKey: 'workspace.phase1QueueTechReview',
        },
        {
          status: 'po_review',
          need: capabilities.canReviewAnalysisPo,
          labelKey: 'workspace.phase1QueuePoApproval',
        },
      ].filter((q) => q.need),
    [
      canSubmitBa,
      capabilities.canReviewAnalysisBa,
      capabilities.canReviewAnalysisTech,
      capabilities.canReviewAnalysisPo,
    ]
  );

  const { data: importSets = [] } = useQuery({
    queryKey: ['analysisImportSets', projectId],
    queryFn: async () => {
      const raw = unwrap(await analysisAPI.listImportSets(projectId));
      return Array.isArray(raw) ? raw : [];
    },
    enabled: Boolean(projectId),
  });

  const pendingSets = useMemo(
    () => importSets.filter((s) => s.status === 'pending_review'),
    [importSets]
  );
  const activeSet = useMemo(
    () => importSets.find((s) => s.status === 'active') || null,
    [importSets]
  );

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['analysisArtifacts', projectId, 'all'],
    queryFn: async () => {
      const raw = unwrap(await analysisAPI.listArtifacts(projectId));
      return Array.isArray(raw) ? raw : [];
    },
    enabled: Boolean(projectId),
  });

  const queues = useMemo(() => {
    return QUEUE_BY_PERM.map((q) => ({
      ...q,
      items: rows.filter((r) => String(r.status) === q.status),
    }));
  }, [rows, QUEUE_BY_PERM]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['analysisArtifacts', projectId] });
    queryClient.invalidateQueries({ queryKey: ['projectAnalysisGaps', String(projectId)] });
    queryClient.invalidateQueries({ queryKey: ['analysisImportSets', projectId] });
  };

  const transitionMut = useMutation({
    mutationFn: ({ id, toStatus, note }) =>
      analysisAPI.transitionArtifact(projectId, id, { toStatus, status: toStatus, note }),
    onSuccess: () => {
      invalidate();
      toast.success(t('workspace.phase1TransitionOk'));
    },
    onError: (err) => toast.error(resolveApiErrorMessage(err)),
  });

  const bulkMut = useMutation({
    mutationFn: ({ fromStatus, toStatus }) =>
      analysisAPI.bulkTransitionArtifacts(projectId, { fromStatus, toStatus }),
    onSuccess: (res) => {
      const data = unwrap(res);
      invalidate();
      toast.success(
        t('workspace.phase1BulkTransitionOk', {
          updated: data?.updated ?? 0,
          skipped: data?.skipped ?? 0,
        })
      );
    },
    onError: (err) => toast.error(resolveApiErrorMessage(err)),
  });

  const setTransitionMut = useMutation({
    mutationFn: ({ setId, toStatus, note }) =>
      analysisAPI.transitionImportSet(projectId, setId, { toStatus, note }),
    onSuccess: () => {
      invalidate();
      toast.success(t('workspace.phase1TransitionOk'));
    },
    onError: (err) => toast.error(resolveApiErrorMessage(err)),
  });

  const canSetBa = capabilities.canReviewAnalysisBa;
  const canSetTech = capabilities.canReviewAnalysisTech;
  const canSetPo = capabilities.canReviewAnalysisPo;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 sm:p-4">
      <div>
        <h1 className="text-base font-semibold">{t('workspace.phaseNavAnalysisReviews')}</h1>
        <p className="text-xs text-muted-foreground">{t('workspace.phase1ApprovalHint')}</p>
        {activeSet ? (
          <p className="text-[11px] text-muted-foreground">{t('workspace.phase1DoubleGateHint')}</p>
        ) : null}
      </div>

      <div className={`rounded-lg border ${queueCardClass('set_queue')}`}>
        <h2 className="border-b border-border/60 px-2.5 py-1.5 text-xs font-semibold">
          {t('workspace.phase1SetQueueTitle')}{' '}
          <span className="text-muted-foreground">({pendingSets.length})</span>
        </h2>
        <ul className="divide-y divide-border/60">
          {pendingSets.map((set) => {
            const next = nextSetGate(set);
            const canAct =
              (next === 'tech_review' && canSetBa) ||
              (next === 'po_review' && canSetTech) ||
              (next === 'approved' && canSetPo);
            return (
              <li
                key={set.id}
                className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-1.5 text-sm"
              >
                <div className="min-w-0">
                  <span className="font-mono text-[11px]">{set.id?.slice(0, 8)}</span>
                  <p className="truncate text-[11px] text-muted-foreground">
                    Raw: {set.rawDocument?.filename || '—'} · Analysis:{' '}
                    {set.analysisDocument?.filename || '—'}
                  </p>
                </div>
                {!readOnly && canAct && next ? (
                  <div className="flex gap-1">
                    <button
                      type="button"
                      className="rounded border border-border px-1.5 py-0.5 text-[11px]"
                      disabled={setTransitionMut.isPending}
                      onClick={() => setTransitionMut.mutate({ setId: set.id, toStatus: next })}
                    >
                      {t('workspace.phase1Approve')}
                    </button>
                    <button
                      type="button"
                      className="rounded border border-destructive/40 px-1.5 py-0.5 text-[11px] text-destructive"
                      disabled={setTransitionMut.isPending}
                      onClick={() =>
                        setTransitionMut.mutate({
                          setId: set.id,
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
          {!pendingSets.length ? (
            <li className="px-2.5 py-3 text-sm text-muted-foreground">
              {t('workspace.phase1SetQueueEmpty')}
            </li>
          ) : null}
        </ul>
      </div>

      {isLoading ? <p className="text-sm text-muted-foreground">{t('common.loading')}</p> : null}

      {!queues.length ? (
        <p className="text-sm text-muted-foreground">{t('workspace.phase1NoReviewPerm')}</p>
      ) : null}

      {queues.map((q) => (
        <div key={q.status} className={`rounded-lg border ${queueCardClass(q.status)}`}>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-2.5 py-1.5">
            <h2 className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
              <span className={statusBadgeClass(q.status)}>{t(q.labelKey)}</span>
              <span className="text-muted-foreground">({q.items.length})</span>
            </h2>
            {!readOnly && q.items.length > 0 && NEXT[q.status] ? (
              <button
                type="button"
                className="rounded border border-border px-2 py-0.5 text-[11px] font-medium"
                disabled={bulkMut.isPending || transitionMut.isPending}
                onClick={() =>
                  bulkMut.mutate({ fromStatus: q.status, toStatus: NEXT[q.status] })
                }
              >
                {t('workspace.phase1BulkApproveQueue')}
              </button>
            ) : null}
          </div>
          <ul className="divide-y divide-border/60">
            {q.items.slice(0, 40).map((item) => {
              const id = String(item.id || item._id);
              return (
                <li
                  key={id}
                  className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-1 text-sm"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1">
                      {item.kind ? (
                        <span className={kindChipClass(item.kind)}>{item.kind}</span>
                      ) : null}
                      <span className="font-mono text-[11px]">{item.externalKey || id.slice(0, 8)}</span>
                    </div>
                    <p className="truncate text-[11px] text-muted-foreground">{item.title || '—'}</p>
                  </div>
                  {!readOnly && NEXT[q.status] ? (
                    <button
                      type="button"
                      className="rounded border border-border px-1.5 py-0.5 text-[11px]"
                      disabled={transitionMut.isPending || bulkMut.isPending}
                      onClick={() =>
                        transitionMut.mutate({ id, toStatus: NEXT[q.status] })
                      }
                    >
                      {t('workspace.phase1Approve')}
                    </button>
                  ) : null}
                </li>
              );
            })}
            {q.items.length > 40 ? (
              <li className="px-2.5 py-1.5 text-[11px] text-muted-foreground">
                {t('workspace.phase1QueueTruncated', { count: q.items.length - 40 })}
              </li>
            ) : null}
            {!q.items.length ? (
              <li className="px-2.5 py-3 text-sm text-muted-foreground">
                {t('workspace.phase1QueueEmpty')}
              </li>
            ) : null}
          </ul>
        </div>
      ))}
    </div>
  );
}
