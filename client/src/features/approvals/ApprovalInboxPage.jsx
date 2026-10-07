import { useCallback, useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Bot, Check, ClipboardList, RefreshCw, X } from 'lucide-react';
import { FIGMA_PAGE_SHELL } from '../../components/Layout/figmaPageClasses';
import { useAppStrings } from '../../locales/appStrings';
import { useAuth } from '../../context/AuthContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import { projectAPI } from '../../services/api/projectAPI';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { buildProjectsPickerPath } from '../../utils/suitePathUtils';
import Modal from '../../components/Shared/Modal';
import {
  adminDangerBtnClass,
  adminInputClass,
  adminLabelClass,
  adminPrimaryBtnClass,
  adminSecondaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import { AdminBusySpinner } from '../../components/adminUsers/adminPanelStates';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

const REJECT_COMMENT_MAX = 1000;

/**
 * Work approval inbox — Phase 5 project approval requests (+ AI drafts tip).
 */
export default function ApprovalInboxPage() {
  const { t } = useAppStrings();
  const { user } = useAuth();
  const { activeWorkspace, company } = useWorkspace();
  const formIdPrefix = useId();
  const commentFieldId = `${formIdPrefix}-reject-comment`;
  const orgId = String(
    activeWorkspace?._id ||
      activeWorkspace?.id ||
      company?.id ||
      company?._id ||
      user?.organizationId ||
      user?.activeOrganizationId ||
      user?.companyId ||
      ''
  ).trim();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [rejectTargetId, setRejectTargetId] = useState('');
  const [rejectComment, setRejectComment] = useState('');

  const load = useCallback(async () => {
    if (!orgId) {
      setItems([]);
      setLoadError(false);
      return;
    }
    setLoading(true);
    setLoadError(false);
    try {
      const res = await projectAPI.listApprovalInbox(orgId, { status: 'pending' });
      const data = unwrap(res);
      setItems(Array.isArray(data) ? data : []);
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('approvals.loadFail') }));
      setItems([]);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [orgId, t]);

  useEffect(() => {
    load();
  }, [load]);

  const decide = async (requestId, decision, comment = '') => {
    setBusyId(requestId);
    try {
      await projectAPI.decideApproval(
        requestId,
        { decision, ...(comment ? { comment } : {}) },
        orgId
      );
      toast.success(
        decision === 'approve' ? t('approvals.approvedToast') : t('approvals.rejectedToast')
      );
      setRejectTargetId('');
      setRejectComment('');
      await load();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('approvals.decideFail') }));
    } finally {
      setBusyId('');
    }
  };

  if (!orgId) {
    return (
      <div
        className={`flex h-[100dvh] flex-col items-center justify-center gap-3 p-6 text-center ${FIGMA_PAGE_SHELL}`}
      >
        <p className="text-muted-foreground">{t('approvals.noAccess')}</p>
        <Link to="/app/collaborate/workspaces" className="text-sm text-primary hover:underline">
          {t('companyAdmin.backToWork')}
        </Link>
      </div>
    );
  }

  return (
    <div className={`flex h-[100dvh] flex-col overflow-hidden ${FIGMA_PAGE_SHELL} text-foreground`}>
      <header className="shrink-0 border-b border-border px-4 py-4 md:px-8">
        <h1 className="text-xl font-bold">{t('approvals.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('approvals.subtitle')}</p>
      </header>
      <main className="flex-1 overflow-auto p-4 md:p-8">
        <div className="mx-auto max-w-2xl space-y-6">
          <section className="rounded-xl border border-border bg-card p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="font-semibold">{t('approvals.pendingTitle')}</h2>
              <button
                type="button"
                className={adminSecondaryBtnClass('inline-flex items-center gap-1 text-xs')}
                onClick={load}
                disabled={loading}
                aria-busy={loading}
              >
                <RefreshCw size={14} aria-hidden="true" className={loading ? 'animate-spin' : ''} />
                {t('common.refresh')}
              </button>
            </div>
            {loading && !items.length ? (
              <div className="space-y-2" role="status">
                <span className="sr-only">{t('common.loading')}</span>
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-20 rounded-lg bg-muted motion-safe:animate-pulse motion-reduce:animate-none"
                  />
                ))}
              </div>
            ) : loadError ? (
              <div role="alert" className="rounded-lg border border-dashed border-border p-6 text-center">
                <p className="mb-3 text-sm text-muted-foreground">
                  {t('approvals.loadError') || t('approvals.loadFail')}
                </p>
                <button type="button" className={adminSecondaryBtnClass('text-xs')} onClick={load}>
                  {t('common.retry')}
                </button>
              </div>
            ) : !items.length ? (
              <div className="rounded-lg border border-dashed border-border p-6 text-center">
                <ClipboardList className="mx-auto mb-2 text-muted-foreground" size={28} aria-hidden="true" />
                <p className="text-sm text-muted-foreground">{t('approvals.emptyInbox')}</p>
              </div>
            ) : (
              <ul className="space-y-3">
                {items.map((row) => {
                  const id = String(row._id);
                  const step = (row.stepsSnapshot || [])[row.currentStep] || {};
                  const busy = busyId === id;
                  const anyBusy = Boolean(busyId);
                  return (
                    <li key={id} className="rounded-lg border border-border px-3 py-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p
                            className="text-sm font-semibold"
                            title={String(row.entityId || '')}
                          >
                            {row.policyKey || t('approvals.policyFallback')} · {row.entityType}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {t('approvals.stepMeta', {
                              from: row.fromStatus || '—',
                              to: row.toStatus || '—',
                              current: (row.currentStep || 0) + 1,
                              total: (row.stepsSnapshot || []).length,
                              role: step.roleKey || step.approverType || '—',
                            })}
                          </p>
                        </div>
                        {row.canAct ? (
                          <div className="flex w-full gap-2 sm:w-auto">
                            <button
                              type="button"
                              disabled={anyBusy}
                              className={adminPrimaryBtnClass(
                                'inline-flex min-h-11 flex-1 items-center justify-center gap-1 px-2.5 py-1.5 text-xs sm:flex-none'
                              )}
                              onClick={() => decide(id, 'approve')}
                            >
                              <AdminBusySpinner busy={busy} />
                              {!busy ? <Check size={14} aria-hidden="true" /> : null}
                              {t('approvals.approve')}
                            </button>
                            <button
                              type="button"
                              disabled={anyBusy}
                              className={adminSecondaryBtnClass(
                                'inline-flex min-h-11 flex-1 items-center justify-center gap-1 px-2.5 py-1.5 text-xs sm:flex-none'
                              )}
                              onClick={() => {
                                setRejectTargetId(id);
                                setRejectComment('');
                              }}
                            >
                              <X size={14} aria-hidden="true" />
                              {t('approvals.reject')}
                            </button>
                          </div>
                        ) : (
                          <span className="text-[10px] uppercase text-muted-foreground">
                            {row.isRequester ? t('approvals.waitingOthers') : t('approvals.viewOnly')}
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="rounded-xl border border-border bg-card p-5">
            <div className="mb-3 flex items-center gap-2 text-primary">
              <Bot size={20} aria-hidden="true" />
              <h2 className="font-semibold">{t('approvals.aiDraftsTitle')}</h2>
            </div>
            <p className="text-sm text-muted-foreground">{t('approvals.aiDraftsHint')}</p>
            <Link
              to={buildProjectsPickerPath(orgId)}
              className="mt-3 inline-block text-sm text-primary hover:underline"
            >
              {t('approvals.openProjects')}
            </Link>
          </section>
        </div>
      </main>

      <Modal
        isOpen={Boolean(rejectTargetId)}
        onClose={() => {
          if (busyId) return;
          setRejectTargetId('');
          setRejectComment('');
        }}
        title={t('approvals.rejectTitle')}
        size="md"
      >
        <div className="space-y-4">
          <div>
            <label htmlFor={commentFieldId} className={adminLabelClass()}>
              {t('approvals.rejectCommentLabel')}
            </label>
            <textarea
              id={commentFieldId}
              rows={3}
              maxLength={REJECT_COMMENT_MAX}
              value={rejectComment}
              onChange={(e) => setRejectComment(e.target.value)}
              placeholder={t('approvals.rejectCommentPh')}
              className={`${adminInputClass()} resize-none`}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={Boolean(busyId)}
              className={adminDangerBtnClass('flex-1')}
              onClick={() => decide(rejectTargetId, 'reject', rejectComment.trim())}
            >
              <span className="inline-flex items-center justify-center gap-2">
                <AdminBusySpinner busy={busyId === rejectTargetId} />
                {t('approvals.rejectConfirm')}
              </span>
            </button>
            <button
              type="button"
              disabled={Boolean(busyId)}
              className={adminSecondaryBtnClass()}
              onClick={() => {
                setRejectTargetId('');
                setRejectComment('');
              }}
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
