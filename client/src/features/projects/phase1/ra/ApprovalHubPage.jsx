import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import ReviewNoteDialog from '../../../../components/Shared/ReviewNoteDialog';
import { analysisAPI } from '../../../../services/api/analysisAPI';
import { useAppStrings } from '../../../../locales/appStrings';
import { resolveApiErrorMessage } from '../../../../utils/resolveApiErrorMessage';
import useProjectCapabilities from '../hooks/useProjectCapabilities';
import { buildPhase1ModulePath } from '../nav/phase1NavConfig';
import { modulePathForArtifactKind } from './artifactRelated';
import Phase1CollapsibleCard from '../shared/Phase1CollapsibleCard';
import Phase1KindGroupQueue from '../shared/Phase1KindGroupQueue';
import { queueCardClass, statusBadgeClass, isTechFocusKind, techFocusBadgeClass } from '../shared/phase1UiTokens';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

const ANALYSIS_KIND_ORDER = Object.freeze([
  'BG',
  'BR',
  'BPM',
  'FR',
  'UC',
  'NFR',
  'SCOPE',
  'INTERFACE',
  'DATA',
  'GLOSSARY',
  'ASSUMPTION',
]);


/** Approve-forward only (bulk). Request changes / Reject need per-item note. */
function nextApproveForStatus(status, hasTech) {
  const s = String(status || '');
  if (s === 'draft') return 'ba_review';
  if (s === 'ba_review') return hasTech ? 'tech_review' : 'po_review';
  if (s === 'tech_review') return 'po_review';
  if (s === 'po_review') return 'approved';
  return null;
}

function nextSetGate(set, hasTech) {
  const review = set?.review || {};
  if (!review.ba?.userId) return 'tech_review';
  if (hasTech && !review.tech?.userId && !review.tech?.skipped) return 'po_review';
  if (!review.po?.userId) return 'approved';
  return null;
}

export default function ApprovalHubPage({ projectId, readOnly = false }) {
  const { t } = useAppStrings();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { capabilities } = useProjectCapabilities(projectId);
  const [noteDialog, setNoteDialog] = useState(null);

  const openArtifactInKindTab = (item) => {
    const id = String(item?.id || item?._id || '').trim();
    if (!id || !projectId) return;
    const moduleSeg = modulePathForArtifactKind(item?.kind);
    if (!moduleSeg) {
      toast.error(t('workspace.phase1OpenArtifactUnknownKind'));
      return;
    }
    navigate(buildPhase1ModulePath(projectId, moduleSeg, { artifact: id }));
  };

  /** Draft / Cần chỉnh sửa = BA theo role matrix (không creator/admin bypass). */
  const canBaAuthorQueue = Boolean(capabilities.canBaAuthorAnalysis);

  const hasTech = Boolean(capabilities.hasAnalysisTechReviewer);

  const QUEUE_BY_PERM = useMemo(
    () =>
      [
        {
          status: 'draft',
          need: canBaAuthorQueue,
          labelKey: 'workspace.phase1QueueDraftSubmit',
        },
        {
          status: 'ba_review',
          need: capabilities.canReviewAnalysisBa && canBaAuthorQueue,
          labelKey: 'workspace.phase1QueueBaReview',
        },
        {
          status: 'tech_review',
          need: hasTech && capabilities.canReviewAnalysisTech,
          labelKey: 'workspace.phase1QueueTechReview',
        },
        {
          status: 'po_review',
          need: capabilities.canReviewAnalysisPo,
          labelKey: 'workspace.phase1QueuePoApproval',
        },
        {
          status: 'changes_requested',
          need: canBaAuthorQueue,
          labelKey: 'workspace.phase1QueueChangesRequested',
        },
      ].filter((q) => q.need),
    [
      canBaAuthorQueue,
      hasTech,
      capabilities.canReviewAnalysisBa,
      capabilities.canReviewAnalysisTech,
      capabilities.canReviewAnalysisPo,
    ]
  );

  const { data: importSets = [], isSuccess: importSetsReady } = useQuery({
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
    // Chờ listImportSets (BE sync draft→tech_review sau BA stamp) rồi mới load queue artifact.
    enabled: Boolean(projectId) && importSetsReady,
  });

  const queues = useMemo(() => {
    return QUEUE_BY_PERM.map((q) => {
      let items = rows.filter((r) => String(r.status) === q.status);
      if (q.status === 'tech_review') {
        items = [...items].sort((a, b) => {
          const af = isTechFocusKind(a.kind) ? 0 : 1;
          const bf = isTechFocusKind(b.kind) ? 0 : 1;
          if (af !== bf) return af - bf;
          return String(a.externalKey || '').localeCompare(String(b.externalKey || ''));
        });
      }
      return { ...q, items };
    });
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
    onSuccess: (res, vars) => {
      invalidate();
      const data = unwrap(res);
      const st = String(data?.status || '');
      if (st === 'active') {
        toast.success(t('workspace.phase1ImportSetGateOkActive'));
      } else if (vars?.toStatus === 'tech_review') {
        toast.success(t('workspace.phase1ImportSetGateOkBa'));
      } else if (vars?.toStatus === 'po_review') {
        toast.success(t('workspace.phase1ImportSetGateOkTech'));
      } else if (vars?.toStatus === 'rejected') {
        toast.success(t('workspace.phase1ImportSetRejected'));
      } else {
        toast.success(t('workspace.phase1TransitionOk'));
      }
    },
    onError: (err) => toast.error(resolveApiErrorMessage(err)),
  });

  const canSetBa = capabilities.canReviewAnalysisBa;
  const canSetTech = capabilities.canReviewAnalysisTech;
  const canSetPo = capabilities.canReviewAnalysisPo;

  const reviewActionsForQueue = (status) => {
    if (status === 'draft' || status === 'changes_requested') return { approve: true };
    if (status === 'ba_review' || status === 'tech_review' || status === 'po_review') {
      return { approve: true, requestChanges: true, reject: true };
    }
    return {};
  };

  const resolveApproveTarget = (item, queueStatus) => {
    if (queueStatus === 'changes_requested') {
      return String(item?.changesRequestedFrom || (hasTech ? 'tech_review' : 'po_review')).toLowerCase();
    }
    return nextApproveForStatus(queueStatus, hasTech);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 sm:p-4">
      <div>
        <h1 className="text-base font-semibold">{t('workspace.phaseNavAnalysisReviews')}</h1>
        <p className="text-xs text-muted-foreground">{t('workspace.phase1ApprovalHint')}</p>
        {activeSet ? (
          <p className="text-[11px] text-muted-foreground">{t('workspace.phase1DoubleGateHint')}</p>
        ) : null}
      </div>

      <Phase1CollapsibleCard
        title={t('workspace.phase1SetQueueTitle')}
        summary={t('workspace.phase1PendingCount', { count: pendingSets.length })}
        defaultOpen={pendingSets.length > 0}
        toneClass={queueCardClass('set_queue')}
      >
        <ul className="divide-y divide-border/60 rounded-lg border border-border/50">
          {pendingSets.map((set) => {
            const next = nextSetGate(set, hasTech);
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
                      {next === 'tech_review'
                        ? t('workspace.phase1ApproveNextBa')
                        : next === 'po_review'
                          ? t('workspace.phase1ApproveNextTech')
                          : t('workspace.phase1ApproveNextPo')}
                    </button>
                    <button
                      type="button"
                      className="rounded border border-destructive/40 px-1.5 py-0.5 text-[11px] text-destructive"
                      disabled={setTransitionMut.isPending}
                      onClick={() =>
                        setNoteDialog({
                          kind: 'set_reject',
                          setId: set.id,
                          variant: 'reject',
                          title: t('workspace.phase1RejectTitle'),
                          description: t('workspace.phase1RejectDescription'),
                          placeholder: t('workspace.phase1ImportSetRejectNotePlaceholder'),
                          submitLabel: t('workspace.phase1ConfirmReject'),
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
      </Phase1CollapsibleCard>

      {isLoading ? <p className="text-sm text-muted-foreground">{t('common.loading')}</p> : null}

      {!queues.length ? (
        <p className="text-sm text-muted-foreground">
          {pendingSets.length && (canSetBa || canSetTech || canSetPo)
            ? t('workspace.phase1ApprovalSetOnlyHint')
            : t('workspace.phase1NoReviewPerm')}
        </p>
      ) : null}

      {queues.map((q) => {
        const actions = reviewActionsForQueue(q.status);
        const bulkTarget = nextApproveForStatus(q.status, hasTech);
        return (
          <Phase1CollapsibleCard
            key={q.status}
            title={
              <span className="inline-flex flex-wrap items-center gap-1.5">
                <span className={statusBadgeClass(q.status)}>{t(q.labelKey)}</span>
                {q.status === 'tech_review' ? (
                  <span className={techFocusBadgeClass()}>{t('workspace.phase1TechFocusBadge')}</span>
                ) : null}
              </span>
            }
            summary={t('workspace.phase1PendingCount', { count: q.items.length })}
            defaultOpen={q.items.length > 0}
            toneClass={queueCardClass(q.status)}
            headerAside={
              !readOnly && q.items.length > 0 && bulkTarget && q.status !== 'changes_requested' ? (
                <button
                  type="button"
                  className="rounded border border-border px-2 py-0.5 text-[11px] font-medium"
                  disabled={bulkMut.isPending || transitionMut.isPending}
                  onClick={(e) => {
                    e.stopPropagation();
                    bulkMut.mutate({ fromStatus: q.status, toStatus: bulkTarget });
                  }}
                >
                  {t('workspace.phase1BulkApproveQueue')}
                </button>
              ) : null
            }
          >
            {q.status === 'tech_review' ? (
              <p className="mb-2 rounded-lg border border-sky-500/20 bg-sky-500/5 px-2.5 py-1.5 text-[11px] text-sky-900 dark:text-sky-100">
                {t('workspace.phase1TechFocusQueueHint')}
              </p>
            ) : null}
            <Phase1KindGroupQueue
              items={q.items.slice(0, 80)}
              kindOrder={ANALYSIS_KIND_ORDER}
              openKindIfCountAtMost={3}
              emptyLabel={t('workspace.phase1QueueEmpty')}
              renderItem={(item) => {
                const id = String(item.id || item._id);
                const approveTo = resolveApproveTarget(item, q.status);
                const focus = isTechFocusKind(item.kind);
                return (
                  <div className="flex flex-wrap items-start justify-between gap-2 text-sm">
                    <button
                      type="button"
                      className="min-w-0 flex-1 rounded-md text-left transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                      onClick={() => openArtifactInKindTab(item)}
                      title={t('workspace.phase1OpenArtifactToEdit')}
                    >
                      <div className="flex flex-wrap items-center gap-1">
                        {focus ? (
                          <span className={techFocusBadgeClass()}>
                            {t('workspace.phase1TechFocusBadge')}
                          </span>
                        ) : null}
                        <span className="font-mono text-[11px] font-semibold text-primary underline-offset-2 hover:underline">
                          {item.externalKey || id.slice(0, 8)}
                        </span>
                      </div>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {item.title || '—'}
                        {item.rejectionReason ? (
                          <span className="ml-1 text-orange-700 dark:text-orange-300">
                            · {item.rejectionReason}
                          </span>
                        ) : null}
                      </p>
                    </button>
                    {!readOnly ? (
                      <div className="flex flex-wrap gap-1">
                        {q.status === 'changes_requested' ? (
                          <button
                            type="button"
                            className="rounded border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary"
                            onClick={() => openArtifactInKindTab(item)}
                          >
                            {t('workspace.phase1OpenArtifactToEdit')}
                          </button>
                        ) : null}
                        {actions.approve && approveTo ? (
                          <button
                            type="button"
                            className="rounded border border-border px-1.5 py-0.5 text-[11px]"
                            disabled={transitionMut.isPending || bulkMut.isPending}
                            onClick={() => transitionMut.mutate({ id, toStatus: approveTo })}
                          >
                            {q.status === 'changes_requested'
                              ? t('workspace.phase1ResubmitReview')
                              : q.status === 'draft'
                                ? t('workspace.phase1SubmitForReview')
                                : t('workspace.phase1Approve')}
                          </button>
                        ) : null}
                        {actions.requestChanges ? (
                          <button
                            type="button"
                            className="rounded border border-orange-500/40 px-1.5 py-0.5 text-[11px] text-orange-800 dark:text-orange-200"
                            disabled={transitionMut.isPending}
                            onClick={() =>
                              setNoteDialog({
                                kind: 'artifact_changes',
                                artifactId: id,
                                variant: 'request_changes',
                                title: t('workspace.phase1RequestChangesTitle'),
                                description: t('workspace.phase1RequestChangesDescription'),
                                placeholder: t('workspace.phase1RequestChangesPlaceholder'),
                                submitLabel: t('workspace.phase1RequestChanges'),
                              })
                            }
                          >
                            {t('workspace.phase1RequestChanges')}
                          </button>
                        ) : null}
                        {actions.reject ? (
                          <button
                            type="button"
                            className="rounded border border-destructive/40 px-1.5 py-0.5 text-[11px] text-destructive"
                            disabled={transitionMut.isPending}
                            onClick={() =>
                              setNoteDialog({
                                kind: 'artifact_reject',
                                artifactId: id,
                                variant: 'reject',
                                title: t('workspace.phase1RejectTitle'),
                                description: t('workspace.phase1RejectDescription'),
                                placeholder: t('workspace.phase1ImportSetRejectNotePlaceholder'),
                                submitLabel: t('workspace.phase1ConfirmReject'),
                              })
                            }
                          >
                            {t('workspace.phase1Reject')}
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              }}
            />
            {q.items.length > 80 ? (
              <p className="mt-2 text-[11px] text-muted-foreground">
                {t('workspace.phase1QueueTruncated', { count: q.items.length - 80 })}
              </p>
            ) : null}
          </Phase1CollapsibleCard>
        );
      })}

      <ReviewNoteDialog
        isOpen={Boolean(noteDialog)}
        onClose={() => setNoteDialog(null)}
        variant={noteDialog?.variant || 'generic'}
        title={noteDialog?.title || ''}
        description={noteDialog?.description || ''}
        placeholder={noteDialog?.placeholder || ''}
        submitLabel={noteDialog?.submitLabel}
        onSubmit={(note) => {
          if (!noteDialog) return;
          if (noteDialog.kind === 'set_reject') {
            setTransitionMut.mutate({
              setId: noteDialog.setId,
              toStatus: 'rejected',
              note,
            });
            return;
          }
          if (noteDialog.kind === 'artifact_changes') {
            transitionMut.mutate({
              id: noteDialog.artifactId,
              toStatus: 'changes_requested',
              note,
            });
            return;
          }
          if (noteDialog.kind === 'artifact_reject') {
            transitionMut.mutate({
              id: noteDialog.artifactId,
              toStatus: 'rejected',
              note,
            });
          }
        }}
      />
    </div>
  );
}
