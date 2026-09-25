/**
 * Planning Approval & baseline — review queue + cut baseline (no bulk Excel import).
 * Import lives on Planning Overview (Workbook-first).
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import ReviewNoteDialog from '../../../../components/Shared/ReviewNoteDialog';
import { planningAPI } from '../../../../services/api/planningAPI';
import { useAppStrings } from '../../../../locales/appStrings';
import { resolveApiErrorMessage } from '../../../../utils/resolveApiErrorMessage';
import useProjectCapabilities from '../hooks/useProjectCapabilities';
import Phase1CollapsibleCard from '../shared/Phase1CollapsibleCard';
import Phase1KindGroupQueue from '../shared/Phase1KindGroupQueue';
import { queueCardClass, statusBadgeClass, formatPhase1StatusLabel } from '../shared/phase1UiTokens';
import PlanningSuggestTasksModal from './PlanningSuggestTasksModal';
import {
  enrichPlanningBaselineReadiness,
  formatPlanningBaselineReadinessLines,
  formatPlanningBaselineReadinessSummary,
} from './planningBaselineReadinessCopy';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

function nextPlanningStatus(status, hasTech, changesRequestedFrom) {
  const s = String(status || '');
  if (s === 'draft') return 'pm_review';
  if (s === 'ba_review') return hasTech ? 'tech_review' : 'pm_review';
  if (s === 'tech_review') return 'po_review';
  if (s === 'pm_review') return hasTech ? 'tech_review' : 'po_review';
  if (s === 'po_review') return 'approved';
  if (s === 'changes_requested') {
    return String(changesRequestedFrom || 'pm_review').toLowerCase();
  }
  if (s === 'rejected') return 'draft';
  return null;
}

function canActOnPlanningStatus(status, capabilities) {
  const s = String(status || '');
  if (s === 'draft' || s === 'changes_requested' || s === 'rejected') {
    return Boolean(capabilities.canEditPlanning);
  }
  if (s === 'pm_review') return Boolean(capabilities.canReviewPlanningPm);
  if (s === 'tech_review') return Boolean(capabilities.canReviewPlanningTech);
  if (s === 'po_review') return Boolean(capabilities.canReviewPlanningPo);
  if (s === 'ba_review') return false;
  return false;
}

export default function PlanningApprovalPage({ projectId }) {
  const { t } = useAppStrings();
  const queryClient = useQueryClient();
  const { capabilities } = useProjectCapabilities(projectId);
  const hasTech = Boolean(capabilities.hasPlanningTechReviewer);
  const [version, setVersion] = useState('');
  const [suggestTasksOpen, setSuggestTasksOpen] = useState(false);
  const [noteDialog, setNoteDialog] = useState(null);

  const { data: rows = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['planningArtifacts', projectId, 'all'],
    queryFn: async () => {
      const raw = unwrap(await planningAPI.listArtifacts(projectId));
      return Array.isArray(raw) ? raw : [];
    },
    enabled: Boolean(projectId),
  });

  const { data: baselines = [] } = useQuery({
    queryKey: ['planningBaselines', projectId],
    queryFn: async () => {
      const raw = unwrap(await planningAPI.listBaselines(projectId));
      return Array.isArray(raw) ? raw : [];
    },
    enabled: Boolean(projectId),
  });

  const { data: summary } = useQuery({
    queryKey: ['planningSummary', projectId],
    queryFn: async () => unwrap(await planningAPI.getSummary(projectId)),
    enabled: Boolean(projectId),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['planningArtifacts', projectId] });
    queryClient.invalidateQueries({ queryKey: ['planningBaselines', projectId] });
    queryClient.invalidateQueries({ queryKey: ['planningSummary', projectId] });
    queryClient.invalidateQueries({ queryKey: ['projectAnalysisGaps', String(projectId)] });
  };

  const transitionMut = useMutation({
    mutationFn: ({ id, toStatus, note }) =>
      planningAPI.transitionArtifact(projectId, id, {
        toStatus,
        status: toStatus,
        note: note || undefined,
      }),
    onSuccess: () => {
      invalidate();
      toast.success(t('workspace.phase1TransitionOk'));
    },
    onError: (err) => toast.error(resolveApiErrorMessage(err)),
  });

  const bulkMut = useMutation({
    mutationFn: ({ fromStatus, toStatus }) =>
      planningAPI.bulkTransitionArtifacts(projectId, { fromStatus, toStatus }),
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

  const cutMut = useMutation({
    mutationFn: () =>
      planningAPI.cutBaseline(projectId, {
        planVersion: version.trim() || `v${baselines.length + 1}`,
      }),
    onSuccess: (res) => {
      const data = unwrap(res);
      invalidate();
      toast.success(t('workspace.phase1PlanningBaselineCut'));
      if (Array.isArray(data?.warnings) && data.warnings[0]?.message) {
        toast(data.warnings[0].message);
      }
    },
    onError: (err) => toast.error(resolveApiErrorMessage(err)),
  });

  const publishMut = useMutation({
    mutationFn: () => planningAPI.publishWbs(projectId),
    onSuccess: (res) => {
      const data = unwrap(res);
      toast.success(
        t('workspace.phase1PublishWbsOk', {
          count: data?.published ?? 0,
        })
      );
    },
    onError: (err) => toast.error(resolveApiErrorMessage(err)),
  });

  const forkMut = useMutation({
    mutationFn: ({ id, note }) => planningAPI.forkArtifactVersion(projectId, id, { note }),
    onSuccess: () => {
      invalidate();
      toast.success(t('workspace.phase1ForkOk'));
    },
    onError: (err) => toast.error(resolveApiErrorMessage(err)),
  });

  const pending = rows.filter((r) => r.status !== 'approved');
  const approved = rows.filter((r) => r.status === 'approved');
  const hasBaseline = Boolean(summary?.planningBaselineExists);
  const queueCounts = useMemo(() => {
    const m = {};
    for (const r of pending) {
      m[r.status] = (m[r.status] || 0) + 1;
    }
    return m;
  }, [pending]);

  const readiness = enrichPlanningBaselineReadiness(
    summary?.baselineReadiness,
    summary?.byKind
  );
  const readinessLines = readiness ? formatPlanningBaselineReadinessLines(readiness, t) : [];
  const readinessSummary = readiness
    ? formatPlanningBaselineReadinessSummary(readiness, t, t('common.loading'))
    : t('common.loading');

  const renderPendingItem = (item) => {
    const id = String(item.id || item._id);
    const st = String(item.status || '');
    const canAct = canActOnPlanningStatus(st, capabilities);
    const next = nextPlanningStatus(st, hasTech, item.changesRequestedFrom);
    const canRequestChanges = ['pm_review', 'tech_review', 'po_review'].includes(st) && canAct;
    return (
      <div className="flex flex-wrap items-start justify-between gap-2 text-sm">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[11px] font-semibold text-foreground">{item.externalKey}</p>
          <p className="truncate text-xs text-foreground">{item.title || '—'}</p>
          <span className={`${statusBadgeClass(item.status)} mt-0.5`}>
            {formatPhase1StatusLabel(item.status, t)}
          </span>
        </div>
        {canAct && next ? (
          <div className="flex shrink-0 flex-wrap gap-1">
            <button
              type="button"
              className="rounded border border-border px-1.5 py-0.5 text-[11px] disabled:opacity-50"
              disabled={transitionMut.isPending}
              onClick={() => transitionMut.mutate({ id, toStatus: next })}
            >
              {st === 'changes_requested' || st === 'draft' || st === 'rejected'
                ? t('workspace.phase1Advance')
                : t('workspace.phase1Approve')}
            </button>
            {canRequestChanges ? (
              <button
                type="button"
                className="rounded border border-orange-500/40 px-1.5 py-0.5 text-[11px] text-orange-800 dark:text-orange-200 disabled:opacity-50"
                disabled={transitionMut.isPending}
                onClick={() =>
                  setNoteDialog({
                    id,
                    toStatus: 'changes_requested',
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
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 sm:p-4">
      <div>
        <h1 className="text-base font-semibold">{t('workspace.phaseNavPlanningApproval')}</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">{t('workspace.phase1PlanningGateHint')}</p>
      </div>

      {isLoading ? <p className="text-sm text-muted-foreground">{t('common.loading')}</p> : null}
      {isError ? (
        <div className="flex items-center gap-2 text-sm">
          <span>{t('common.error')}</span>
          <button type="button" className="rounded border px-2 py-0.5 text-xs" onClick={() => refetch()}>
            {t('common.retry')}
          </button>
        </div>
      ) : null}

      {readiness ? (
        <Phase1CollapsibleCard
          title={t('workspace.phase1BaselineReadiness')}
          summary={readinessSummary}
          defaultOpen={!readiness.ok}
          toneClass={
            readiness.ok
              ? 'border-emerald-500/30 bg-emerald-500/5'
              : 'border-amber-500/30 bg-amber-500/5'
          }
        >
          <p className="text-xs">{readinessSummary}</p>
          {readinessLines.slice(1).map((line) => (
            <p key={line} className="mt-1 text-[11px] text-muted-foreground">
              {line}
            </p>
          ))}
        </Phase1CollapsibleCard>
      ) : null}

      <Phase1CollapsibleCard
        title={t('workspace.phase1PendingArtifacts')}
        summary={
          pending.length
            ? t('workspace.phase1PendingCount', { count: pending.length })
            : t('workspace.phase1AllPlanningApproved')
        }
        defaultOpen={pending.length > 0}
        toneClass={queueCardClass('pm_review')}
      >
        {pending.length ? (
          <div className="mb-3 space-y-2">
            <div className="flex flex-wrap gap-1.5" aria-label={t('workspace.phase1PendingArtifacts')}>
              {['draft', 'pm_review', 'tech_review', 'po_review', 'changes_requested', 'rejected'].map(
                (st) => {
                  const n = queueCounts[st] || 0;
                  if (!n) return null;
                  return (
                    <span key={st} className={statusBadgeClass(st)}>
                      {formatPhase1StatusLabel(st, t)} · {n}
                    </span>
                  );
                }
              )}
            </div>
            {(() => {
              const bulkFromStatuses = ['draft', 'pm_review', 'tech_review', 'po_review'].filter(
                (from) =>
                  (queueCounts[from] || 0) > 0 && canActOnPlanningStatus(from, capabilities)
              );
              if (bulkFromStatuses.length) {
                return (
                  <div className="flex flex-wrap gap-1.5">
                    {bulkFromStatuses.map((from) => {
                      const to = nextPlanningStatus(from, hasTech);
                      if (!to) return null;
                      return (
                        <button
                          key={from}
                          type="button"
                          className="rounded border border-border px-2 py-0.5 text-[11px] disabled:opacity-50"
                          disabled={bulkMut.isPending}
                          onClick={() => bulkMut.mutate({ fromStatus: from, toStatus: to })}
                        >
                          {t('workspace.phase1BulkAdvance', {
                            from: formatPhase1StatusLabel(from, t) || from,
                            to: formatPhase1StatusLabel(to, t) || to,
                            count: queueCounts[from] || 0,
                          })}
                        </button>
                      );
                    })}
                  </div>
                );
              }
              // SoD / wrong queue stage — explain missing bulk for this role.
              let hintKey = 'workspace.phase1PlanningBulkNoActionHint';
              if ((queueCounts.draft || 0) > 0 && !capabilities.canEditPlanning) {
                hintKey = 'workspace.phase1PlanningBulkNeedPmForDraft';
              } else if ((queueCounts.pm_review || 0) > 0 && !capabilities.canReviewPlanningPm) {
                hintKey = 'workspace.phase1PlanningBulkNeedPmReview';
              } else if (
                (queueCounts.tech_review || 0) > 0 &&
                !capabilities.canReviewPlanningTech
              ) {
                hintKey = 'workspace.phase1PlanningBulkNeedTechReview';
              } else if ((queueCounts.po_review || 0) > 0 && !capabilities.canReviewPlanningPo) {
                hintKey = 'workspace.phase1PlanningBulkNeedPoReview';
              }
              return (
                <p className="rounded-lg border border-border/60 bg-muted/20 px-2.5 py-2 text-[11px] text-muted-foreground">
                  {t(hintKey)}
                </p>
              );
            })()}
          </div>
        ) : null}

        <Phase1KindGroupQueue
          items={pending}
          openKindIfCountAtMost={3}
          emptyLabel={t('workspace.phase1AllPlanningApproved')}
          renderItem={renderPendingItem}
        />
      </Phase1CollapsibleCard>

      {capabilities.canCutPlanningBaseline ? (
        <Phase1CollapsibleCard
          title={t('workspace.phase1CutBaselineCardTitle')}
          summary={
            hasBaseline
              ? t('workspace.phase1CutBaselineCardHasBaseline')
              : t('workspace.phase1CutBaselineCardNeed')
          }
          defaultOpen={Boolean(readiness?.ok && !hasBaseline)}
        >
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="rounded-lg border border-border bg-background px-2.5 py-1 text-sm"
              placeholder={t('workspace.phase1PlanVersionPlaceholder')}
              value={version}
              onChange={(e) => setVersion(e.target.value)}
            />
            <button
              type="button"
              className="rounded-lg bg-primary px-2.5 py-1 text-xs text-primary-foreground disabled:opacity-50"
              disabled={cutMut.isPending || readiness?.ok === false}
              onClick={() => cutMut.mutate()}
            >
              {t('workspace.phase1CutPlanningBaseline')}
            </button>
            {hasBaseline ? (
              <>
                <button
                  type="button"
                  className="rounded-lg border border-border px-2.5 py-1 text-xs disabled:opacity-50"
                  disabled={publishMut.isPending}
                  onClick={() => publishMut.mutate()}
                >
                  {t('workspace.phase1PublishWbs')}
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
                  onClick={() => setSuggestTasksOpen(true)}
                >
                  {t('workspace.phase1SuggestTasksCta')}
                </button>
              </>
            ) : null}
          </div>
          {!hasBaseline && readiness && readiness.ok === false ? (
            <p className="mt-2 text-[11px] text-muted-foreground">
              {t('workspace.phase1CutBaselineNeedApproveFirst')}
            </p>
          ) : null}
        </Phase1CollapsibleCard>
      ) : null}

      {hasBaseline && approved.length && capabilities.canEditPlanning ? (
        <Phase1CollapsibleCard
          title={t('workspace.phase1ForkTitle')}
          summary={t('workspace.phase1ForkHint')}
          defaultOpen={false}
        >
          <Phase1KindGroupQueue
            items={approved.slice(0, 40)}
            openKindIfCountAtMost={2}
            renderItem={(item) => {
              const id = String(item.id || item._id);
              return (
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs">
                    <span className="font-mono text-[11px]">{item.externalKey}</span>
                    <span className={statusBadgeClass('approved')}>v{item.version || 1}</span>
                  </span>
                  <button
                    type="button"
                    className="rounded border border-border px-1.5 py-0.5 text-[11px] disabled:opacity-50"
                    disabled={forkMut.isPending}
                    onClick={() => forkMut.mutate({ id, note: 'change-control' })}
                  >
                    {t('workspace.phase1ForkAction')}
                  </button>
                </div>
              );
            }}
          />
        </Phase1CollapsibleCard>
      ) : null}

      <Phase1CollapsibleCard
        title={t('workspace.phase1Baselines')}
        summary={
          baselines.length
            ? t('workspace.phase1BaselinesCount', { count: baselines.length })
            : t('workspace.phase1EmptySection')
        }
        defaultOpen={false}
      >
        <ul className="divide-y divide-border/60 rounded-lg border border-border/50">
          {baselines.map((b) => (
            <li key={b.id || b._id} className="px-2.5 py-1.5 text-xs">
              {t('workspace.phase1BaselineArtifactsCount', {
                version: b.planVersion,
                count: (b.artifactSnapshot || []).length,
              })}
              {b.isActive === false ? (
                <span className="ml-2 text-[11px] text-muted-foreground">
                  ({t('workspace.phase1BaselineInactive')})
                </span>
              ) : null}
            </li>
          ))}
          {!baselines.length ? (
            <li className="px-2.5 py-4 text-center text-sm text-muted-foreground">
              {t('workspace.phase1EmptySection')}
            </li>
          ) : null}
        </ul>
      </Phase1CollapsibleCard>

      <PlanningSuggestTasksModal
        projectId={projectId}
        open={suggestTasksOpen}
        onClose={() => setSuggestTasksOpen(false)}
      />

      <ReviewNoteDialog
        isOpen={Boolean(noteDialog)}
        onClose={() => setNoteDialog(null)}
        variant="request_changes"
        title={noteDialog?.title || ''}
        description={noteDialog?.description || ''}
        placeholder={noteDialog?.placeholder || ''}
        submitLabel={noteDialog?.submitLabel}
        onSubmit={(note) => {
          if (!noteDialog?.id || !noteDialog?.toStatus) return;
          transitionMut.mutate({
            id: noteDialog.id,
            toStatus: noteDialog.toStatus,
            note,
          });
        }}
      />
    </div>
  );
}
