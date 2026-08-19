import { useEffect, useMemo, useState } from 'react';
import { Pencil, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { ConfirmDialog } from '../../Shared';
import { useAppStrings } from '../../../locales/appStrings';
import { projectAPI } from '../../../services/api/projectAPI';
import { resolveApiErrorMessage } from '../../../utils/resolveApiErrorMessage';
import EntityApprovalTimeline from '../../../features/approvals/EntityApprovalTimeline';
import { formatHubDateTime, unwrapChangeRequestEntity, displayIssueKey, resolveHubActor, isLinkableCrWorkType, collectCrWorkItems, mergeChangeRequestPatch } from './projectHubUtils';
import { listAllowedCrStatusTransitions, labelCrWorkStatus } from './projectHubCrWorkflow';

const CR_DETAIL_TABS = [
  { id: 'overview', labelKey: 'workspace.projectHubCrTabOverview' },
  { id: 'impact', labelKey: 'workspace.projectHubCrTabImpact' },
  { id: 'workItems', labelKey: 'workspace.projectHubCrTabWorkItems' },
  { id: 'approval', labelKey: 'workspace.projectHubCrTabApproval' },
  { id: 'activity', labelKey: 'workspace.projectHubCrTabActivity' },
];

const IMPACT_FIELDS = [
  { key: 'affectedRequirement', labelKey: 'workspace.projectHubCrImpactRequirement' },
  { key: 'affectedFeature', labelKey: 'workspace.projectHubCrImpactFeature' },
  { key: 'affectedSprint', labelKey: 'workspace.projectHubCrImpactSprint' },
  { key: 'affectedTeam', labelKey: 'workspace.projectHubCrImpactTeam' },
  { key: 'estimatedEffort', labelKey: 'workspace.projectHubCrImpactEffort' },
  { key: 'scheduleImpact', labelKey: 'workspace.projectHubCrImpactSchedule' },
  { key: 'costImpact', labelKey: 'workspace.projectHubCrImpactCost' },
  { key: 'risk', labelKey: 'workspace.projectHubCrImpactRisk' },
];

function emptyImpact() {
  return {
    affectedRequirement: '',
    affectedFeature: '',
    affectedSprint: '',
    affectedTeam: '',
    estimatedEffort: '',
    scheduleImpact: '',
    costImpact: '',
    risk: '',
  };
}

function Field({ label, value }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-wrap text-sm text-foreground">{value || '—'}</dd>
    </div>
  );
}

function ChangeBlock({ label, value }) {
  return (
    <div className="rounded-lg border border-border px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{value || '—'}</p>
    </div>
  );
}

/**
 * Drawer chi tiết Change Request — Overview / Impact / Work Items / Approval / Activity.
 */
export default function ProjectHubChangeRequestDetailDrawer({
  open = false,
  projectId = '',
  crId = '',
  locale = 'en',
  projectCode = '',
  refreshKey = 0,
  canUpdate = false,
  canDelete = false,
  boardCards = [],
  lists = [],
  projectMembers = [],
  onEdit = null,
  onDeleted = null,
  onStatusChanged = null,
  onOpenWorkItem = null,
  onWorkItemsChanged = null,
  onClose = null,
}) {
  const { t } = useAppStrings();
  const [row, setRow] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [tab, setTab] = useState('overview');
  const [transitioning, setTransitioning] = useState(false);
  const [impactDraft, setImpactDraft] = useState(emptyImpact());
  const [savingImpact, setSavingImpact] = useState(false);
  const [linkTaskId, setLinkTaskId] = useState('');
  const [linking, setLinking] = useState(false);
  const [submittingApproval, setSubmittingApproval] = useState(false);
  const [approvalEpoch, setApprovalEpoch] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (confirmDelete) {
        if (!deleting) setConfirmDelete(false);
        return;
      }
      onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, confirmDelete, deleting]);

  useEffect(() => {
    if (!open) {
      setConfirmDelete(false);
      setDeleting(false);
    }
  }, [open]);

  useEffect(() => {
    setTab('overview');
  }, [crId]);

  useEffect(() => {
    if (!open || !projectId || !crId) {
      setRow(null);
      setLoadError(false);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(false);
      try {
        const res = await projectAPI.getChangeRequest(projectId, crId);
        if (!cancelled) {
          const entity = unwrapChangeRequestEntity(res);
          setRow(entity);
          setImpactDraft({ ...emptyImpact(), ...(entity?.impact || {}) });
        }
      } catch {
        if (!cancelled) {
          setRow(null);
          setLoadError(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, projectId, crId, refreshKey]);

  const linkedIds = useMemo(() => {
    const ids = new Set();
    for (const id of row?.workItemIds || []) {
      if (id) ids.add(String(id));
    }
    for (const w of row?.workItems || []) {
      const id = String(w?._id || w?.id || '');
      if (id) ids.add(id);
    }
    return ids;
  }, [row?.workItemIds, row?.workItems]);

  const linkableCards = useMemo(
    () =>
      (boardCards || []).filter((c) => {
        const id = String(c._id || c.id || '');
        if (!id || linkedIds.has(id)) return false;
        return isLinkableCrWorkType(c.issueType || c.type);
      }),
    [boardCards, linkedIds]
  );

  if (!open) return null;

  const labelOrRaw = (prefix, value) => {
    if (!value) return '';
    const key = `${prefix}_${value}`;
    const label = t(key);
    return label === key ? String(value) : label;
  };
  const typeLabel = labelOrRaw('workspace.projectHubCrType', row?.type);
  const statusLabel = labelOrRaw('workspace.projectHubCrStatus', row?.status);
  const workStatusValue = String(row?.workStatus || '').trim();
  const workStatusFromList = labelCrWorkStatus(workStatusValue, lists);
  const workStatusI18n = workStatusValue
    ? labelOrRaw('workspace.projectHubWorkStatus', workStatusValue)
    : '';
  let workStatusLabel = '';
  if (workStatusValue) {
    if (workStatusFromList && workStatusFromList !== workStatusValue.toLowerCase()) {
      workStatusLabel = workStatusFromList;
    } else {
      workStatusLabel = workStatusI18n || workStatusFromList || workStatusValue;
    }
  }
  const priorityLabel = labelOrRaw('workspace.projectHubCrPriority', row?.priority);
  const approvalRequired = Boolean(row?.approvalRequired);
  const nextStatuses = listAllowedCrStatusTransitions(row?.status).filter((s) => {
    if (!approvalRequired) return true;
    return s !== 'approved' && s !== 'rejected';
  });

  const applySaved = (saved, patch = {}) => {
    const hasWorkPatch = Boolean(patch.linkWorkItemId || patch.unlinkWorkItemId);
    if (!saved && !hasWorkPatch) return;
    setRow((prev) => mergeChangeRequestPatch(prev, saved || {}, patch, boardCards));
    if (saved?.impact && typeof saved.impact === 'object') {
      setImpactDraft({ ...emptyImpact(), ...saved.impact });
    }
    onStatusChanged?.(saved);
  };

  const onTransition = async (nextStatus) => {
    if (!canUpdate || !projectId || !crId || transitioning) return;
    setTransitioning(true);
    try {
      const res = await projectAPI.patchChangeRequest(projectId, crId, { status: nextStatus });
      applySaved(unwrapChangeRequestEntity(res));
      toast.success(t('workspace.projectHubCrTransitionDone'));
    } catch (err) {
      toast.error(
        resolveApiErrorMessage(err, { t, fallback: t('workspace.projectHubCrTransitionFail') })
      );
    } finally {
      setTransitioning(false);
    }
  };

  const saveImpact = async () => {
    if (!canUpdate || !projectId || !crId || savingImpact) return;
    setSavingImpact(true);
    try {
      const res = await projectAPI.patchChangeRequest(projectId, crId, { impact: impactDraft });
      applySaved(unwrapChangeRequestEntity(res));
      toast.success(t('workspace.projectHubCrImpactSaved'));
    } catch (err) {
      toast.error(
        resolveApiErrorMessage(err, { t, fallback: t('workspace.projectHubCrImpactSaveFail') })
      );
    } finally {
      setSavingImpact(false);
    }
  };

  const linkWorkItem = async () => {
    if (!canUpdate || !linkTaskId || linking) return;
    setLinking(true);
    try {
      const res = await projectAPI.patchChangeRequest(projectId, crId, {
        linkWorkItemId: linkTaskId,
      });
      applySaved(unwrapChangeRequestEntity(res), { linkWorkItemId: linkTaskId });
      setLinkTaskId('');
      onWorkItemsChanged?.();
      toast.success(t('workspace.projectHubCrWorkLinked'));
    } catch (err) {
      toast.error(
        resolveApiErrorMessage(err, { t, fallback: t('workspace.projectHubCrWorkLinkFail') })
      );
    } finally {
      setLinking(false);
    }
  };

  const unlinkWorkItem = async (taskId) => {
    if (!canUpdate || !taskId || linking) return;
    setLinking(true);
    try {
      const res = await projectAPI.patchChangeRequest(projectId, crId, {
        unlinkWorkItemId: taskId,
      });
      applySaved(unwrapChangeRequestEntity(res), { unlinkWorkItemId: taskId });
      onWorkItemsChanged?.();
      toast.success(t('workspace.projectHubCrWorkUnlinked'));
    } catch (err) {
      toast.error(
        resolveApiErrorMessage(err, { t, fallback: t('workspace.projectHubCrWorkUnlinkFail') })
      );
    } finally {
      setLinking(false);
    }
  };

  const submitApproval = async () => {
    if (!projectId || !crId || submittingApproval) return;
    setSubmittingApproval(true);
    try {
      const res = await projectAPI.submitChangeRequestApproval(projectId, crId);
      const data = res?.data?.data ?? res?.data ?? res;
      if (data?.changeRequest) applySaved(data.changeRequest);
      else {
        const refreshed = await projectAPI.getChangeRequest(projectId, crId);
        applySaved(unwrapChangeRequestEntity(refreshed));
      }
      setApprovalEpoch((n) => n + 1);
      toast.success(t('workspace.projectHubCrSubmitApprovalDone'));
    } catch (err) {
      toast.error(
        resolveApiErrorMessage(err, {
          t,
          fallback: t('workspace.projectHubCrSubmitApprovalFail'),
        })
      );
    } finally {
      setSubmittingApproval(false);
    }
  };

  const deleteCr = async () => {
    if (!canDelete || !projectId || !crId || deleting) return;
    setDeleting(true);
    try {
      await projectAPI.deleteChangeRequest(projectId, crId);
      toast.success(t('workspace.projectHubCrDeleted'));
      setConfirmDelete(false);
      onDeleted?.();
      onClose?.();
    } catch (err) {
      toast.error(
        resolveApiErrorMessage(err, { t, fallback: t('workspace.projectHubCrDeleteFail') })
      );
    } finally {
      setDeleting(false);
    }
  };

  const renderOverview = () => (
    <div className="flex flex-col gap-4">
      <dl className="flex flex-col gap-3">
        <Field label={t('workspace.projectHubCrColId')} value={row?.code} />
        <Field label={t('workspace.projectHubCrColTitle')} value={row?.title} />
        <Field label={t('workspace.projectHubCrFieldDescription')} value={row?.description} />
        <Field label={t('workspace.projectHubCrColType')} value={typeLabel} />
        <Field label={t('workspace.projectHubCrColPriority')} value={priorityLabel} />
        <Field label={t('workspace.projectHubCrColApproval')} value={statusLabel} />
        <Field label={t('workspace.projectHubCrColWorkStatus')} value={workStatusLabel} />
        <Field
          label={t('workspace.projectHubCrColCreatedBy')}
          value={resolveHubActor(row, projectMembers)?.name || ''}
        />
        <Field
          label={t('workspace.projectHubCrColCreatedAt')}
          value={formatHubDateTime(row?.createdAt, locale)}
        />
        <Field label={t('workspace.projectHubCrFieldReason')} value={row?.reason} />
      </dl>
      <div className="flex flex-col gap-2">
        <ChangeBlock label={t('workspace.projectHubCrFieldCurrent')} value={row?.current} />
        <span className="self-center text-muted-foreground" aria-hidden>
          ↓
        </span>
        <ChangeBlock
          label={t('workspace.projectHubCrFieldRequestedChange')}
          value={row?.requestedChange}
        />
      </div>
    </div>
  );

  const renderImpact = () => (
    <div className="flex flex-col gap-3">
      {IMPACT_FIELDS.map((f) => (
        <label key={f.key} className="block text-xs font-semibold text-muted-foreground">
          {t(f.labelKey)}
          <textarea
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-60"
            rows={2}
            value={impactDraft[f.key] || ''}
            disabled={!canUpdate || savingImpact}
            onChange={(e) => setImpactDraft((prev) => ({ ...prev, [f.key]: e.target.value }))}
          />
        </label>
      ))}
      {canUpdate ? (
        <button
          type="button"
          disabled={savingImpact}
          onClick={() => void saveImpact()}
          className="self-end rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
        >
          {t('workspace.projectHubCrImpactSave')}
        </button>
      ) : null}
    </div>
  );

  const renderWorkItems = () => {
    const works = collectCrWorkItems(row, boardCards);
    return (
    <div className="flex flex-col gap-3">
      {works.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('workspace.projectHubCrWorkEmpty')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {works.map((w) => {
            const id = String(w._id || w.id || '');
            return (
              <li
                key={id}
                className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm"
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left font-semibold text-primary hover:underline"
                  onClick={() => onOpenWorkItem?.(w)}
                >
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {displayIssueKey(projectCode, id)}
                  </span>{' '}
                  {w.title || '—'}
                </button>
                {canUpdate ? (
                  <button
                    type="button"
                    className="text-xs font-semibold text-muted-foreground hover:text-destructive"
                    disabled={linking}
                    onClick={() => void unlinkWorkItem(id)}
                  >
                    {t('workspace.projectHubCrWorkUnlink')}
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {canUpdate ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="min-w-0 flex-1 text-xs font-semibold text-muted-foreground">
            {t('workspace.projectHubCrWorkLink')}
            <select
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              value={linkTaskId}
              onChange={(e) => setLinkTaskId(e.target.value)}
              disabled={linking}
            >
              <option value="">{t('workspace.projectHubCrWorkPick')}</option>
              {linkableCards.map((c) => {
                const id = String(c._id || c.id);
                return (
                  <option key={id} value={id}>
                    {displayIssueKey(projectCode, id)} — {c.title || id}
                  </option>
                );
              })}
            </select>
          </label>
          <button
            type="button"
            disabled={!linkTaskId || linking}
            onClick={() => void linkWorkItem()}
            className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
          >
            {t('workspace.projectHubCrWorkAdd')}
          </button>
        </div>
      ) : null}
    </div>
    );
  };

  const renderApproval = () => (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {t('workspace.projectHubCrApprovalCurrent')}
        </p>
        <p className="mt-1 text-sm font-semibold text-foreground">{statusLabel || '—'}</p>
      </div>
      {approvalRequired && String(row?.status) === 'reviewing' ? (
        <button
          type="button"
          disabled={submittingApproval}
          onClick={() => void submitApproval()}
          className="self-start rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
        >
          {t('workspace.projectHubCrSubmitApproval')}
        </button>
      ) : null}
      {canUpdate && nextStatuses.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t('workspace.projectHubCrApprovalActions')}
          </p>
          <div className="flex flex-wrap gap-2">
            {nextStatuses.map((statusId) => (
              <button
                key={statusId}
                type="button"
                disabled={transitioning}
                onClick={() => void onTransition(statusId)}
                className="rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50"
              >
                {labelOrRaw('workspace.projectHubCrStatus', statusId)}
              </button>
            ))}
          </div>
        </div>
      ) : canUpdate && nextStatuses.length === 0 && !approvalRequired ? (
        <p className="text-sm text-muted-foreground">{t('workspace.projectHubCrApprovalNoActions')}</p>
      ) : null}
      {approvalRequired ? (
        <EntityApprovalTimeline
          key={approvalEpoch}
          entityType="change_request"
          entityId={crId}
        />
      ) : (
        <p className="text-xs text-muted-foreground">{t('workspace.projectHubCrApprovalOptionalHint')}</p>
      )}
    </div>
  );

  const renderActivity = () => {
    const events = Array.isArray(row?.activity) ? [...row.activity].reverse() : [];
    if (!events.length) {
      return <p className="text-sm text-muted-foreground">{t('workspace.projectHubCrActivityEmpty')}</p>;
    }
    return (
      <ul className="flex flex-col gap-3">
        {events.map((ev, idx) => {
          const key = `${ev.at || ''}-${ev.from || ''}-${ev.to || ''}-${idx}`;
          const line = t('workspace.projectHubCrActivityStatusChanged', {
            actor: ev.actorName || '—',
            from: labelOrRaw('workspace.projectHubCrStatus', ev.from) || ev.from || '—',
            to: labelOrRaw('workspace.projectHubCrStatus', ev.to) || ev.to || '—',
            at: formatHubDateTime(ev.at, locale) || '—',
          });
          return (
            <li key={key} className="rounded-lg border border-border px-3 py-2 text-sm text-foreground">
              {line}
            </li>
          );
        })}
      </ul>
    );
  };

  const renderTabBody = () => {
    if (tab === 'overview') return renderOverview();
    if (tab === 'impact') return renderImpact();
    if (tab === 'workItems') return renderWorkItems();
    if (tab === 'approval') return renderApproval();
    if (tab === 'activity') return renderActivity();
    return <p className="text-sm text-muted-foreground">{t('workspace.projectHubCrTabComingSoon')}</p>;
  };

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-40 bg-black/40"
        aria-label={t('workspace.projectHubCrDetailClose')}
        onClick={() => {
          if (confirmDelete) return;
          onClose?.();
        }}
      />
      <aside
        className="fixed inset-y-0 right-0 z-50 flex h-full w-full max-w-lg flex-col border-l border-border bg-surface shadow-lg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-hub-cr-detail-title"
      >
        <header className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t('workspace.projectHubCrDetailTitle')}
            </p>
            <h3 id="project-hub-cr-detail-title" className="truncate text-sm font-bold text-foreground">
              {row?.code || t('workspace.projectHubCrDetailTitle')}
            </h3>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {canUpdate && row && !loading && !loadError ? (
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-semibold text-foreground hover:bg-muted"
                onClick={() => onEdit?.(row)}
              >
                <Pencil size={12} aria-hidden />
                {t('workspace.projectHubCrEdit')}
              </button>
            ) : null}
            {canDelete && row && !loading && !loadError ? (
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-md border border-destructive/40 px-2 py-1 text-xs font-semibold text-destructive hover:bg-destructive/10"
                disabled={deleting}
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 size={12} aria-hidden />
                {t('workspace.projectHubCrDelete')}
              </button>
            ) : null}
            <button
              type="button"
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={t('workspace.projectHubCrDetailClose')}
              onClick={() => {
                if (confirmDelete) return;
                onClose?.();
              }}
            >
              <X size={16} aria-hidden />
            </button>
          </div>
        </header>

        <div
          className="flex shrink-0 gap-1 overflow-x-auto border-b border-border px-4 py-2"
          role="tablist"
          aria-label={t('workspace.projectHubCrDetailTitle')}
        >
          {CR_DETAIL_TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              onClick={() => setTab(item.id)}
              className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold ${
                tab === item.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
              }`}
            >
              {t(item.labelKey)}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
          ) : loadError ? (
            <p className="text-sm text-muted-foreground">{t('workspace.projectHubCrLoadFail')}</p>
          ) : (
            renderTabBody()
          )}
        </div>
      </aside>
      <ConfirmDialog
        isOpen={confirmDelete}
        onClose={() => {
          if (!deleting) setConfirmDelete(false);
        }}
        onConfirm={() => deleteCr()}
        title={t('workspace.projectHubCrDeleteConfirmTitle')}
        message={t('workspace.projectHubCrDeleteConfirm', { code: row?.code || 'CR' })}
        confirmText={t('workspace.projectHubCrDelete')}
        cancelText={t('common.cancel')}
      />
    </>
  );
}
