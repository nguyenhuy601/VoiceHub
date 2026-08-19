import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Bot, Check, ClipboardList, X } from 'lucide-react';
import { FIGMA_PAGE_SHELL } from '../../components/Layout/figmaPageClasses';
import { useAppStrings } from '../../locales/appStrings';
import { useAuth } from '../../context/AuthContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import { projectAPI } from '../../services/api/projectAPI';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

/**
 * Work approval inbox — Phase 5 project approval requests (+ AI drafts tip).
 */
export default function ApprovalInboxPage() {
  const { t } = useAppStrings();
  const { user } = useAuth();
  const { activeWorkspace, company } = useWorkspace();
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
  const [busyId, setBusyId] = useState('');

  const load = useCallback(async () => {
    if (!orgId) {
      setItems([]);
      return;
    }
    setLoading(true);
    try {
      const res = await projectAPI.listApprovalInbox(orgId, { status: 'pending' });
      const data = unwrap(res);
      setItems(Array.isArray(data) ? data : []);
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('approvals.loadFail') }));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [orgId, t]);

  useEffect(() => {
    load();
  }, [load]);

  const decide = async (requestId, decision) => {
    setBusyId(requestId);
    try {
      await projectAPI.decideApproval(requestId, { decision }, orgId);
      toast.success(
        decision === 'approve' ? t('approvals.approvedToast') : t('approvals.rejectedToast')
      );
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
                className="text-xs font-semibold text-primary"
                onClick={load}
                disabled={loading}
              >
                {loading ? '…' : t('common.refresh') || 'Refresh'}
              </button>
            </div>
            {loading && !items.length ? (
              <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
            ) : !items.length ? (
              <div className="rounded-lg border border-dashed border-border p-6 text-center">
                <ClipboardList className="mx-auto mb-2 text-muted-foreground" size={28} />
                <p className="text-sm text-muted-foreground">{t('approvals.emptyInbox')}</p>
              </div>
            ) : (
              <ul className="space-y-3">
                {items.map((row) => {
                  const id = String(row._id);
                  const step = (row.stepsSnapshot || [])[row.currentStep] || {};
                  return (
                    <li key={id} className="rounded-lg border border-border px-3 py-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold">
                            {row.policyKey || 'approval'} · {row.entityType}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {row.fromStatus || '—'} → {row.toStatus || '—'} · step{' '}
                            {(row.currentStep || 0) + 1}/{(row.stepsSnapshot || []).length} (
                            {step.roleKey || step.approverType || '—'})
                          </p>
                          <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
                            {row.entityId}
                          </p>
                        </div>
                        {row.canAct ? (
                          <div className="flex gap-2">
                            <button
                              type="button"
                              disabled={Boolean(busyId)}
                              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                              onClick={() => decide(id, 'approve')}
                            >
                              <Check size={14} />
                              {t('approvals.approve')}
                            </button>
                            <button
                              type="button"
                              disabled={Boolean(busyId)}
                              className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50"
                              onClick={() => decide(id, 'reject')}
                            >
                              <X size={14} />
                              {t('approvals.reject')}
                            </button>
                          </div>
                        ) : (
                          <span className="text-[10px] uppercase text-muted-foreground">
                            {row.isRequester ? t('approvals.waitingOthers') : 'view'}
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
              <Bot size={20} />
              <h2 className="font-semibold">{t('approvals.aiDraftsTitle')}</h2>
            </div>
            <p className="text-sm text-muted-foreground">{t('approvals.aiDraftsHint')}</p>
            <Link
              to="/app/collaborate/projects"
              className="mt-3 inline-block text-sm text-primary hover:underline"
            >
              {t('approvals.openProjects')}
            </Link>
          </section>
        </div>
      </main>
    </div>
  );
}
