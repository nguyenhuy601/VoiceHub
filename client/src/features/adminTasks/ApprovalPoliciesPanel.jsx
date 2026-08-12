import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  AdminUserFormCard,
  AdminUserPanelShell,
  adminPrimaryBtnClass,
  adminSecondaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import { useAppStrings } from '../../locales/appStrings';
import { projectAPI } from '../../services/api/projectAPI';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

/**
 * Admin — Approval Policy catalog (Task Done / MR / Release stubs).
 */
export default function ApprovalPoliciesPanel({ orgId }) {
  const { t } = useAppStrings();
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [stubBusy, setStubBusy] = useState(false);
  const [stubProjectId, setStubProjectId] = useState('');

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const res = await projectAPI.listApprovalPolicies(orgId);
      const list = unwrap(res);
      setPolicies(Array.isArray(list) ? list : []);
    } catch (error) {
      toast.error(
        resolveApiErrorMessage(error, { t, fallback: t('adminTasks.approvalPolicyLoadFail') })
      );
      setPolicies([]);
    } finally {
      setLoading(false);
    }
  }, [orgId, t]);

  useEffect(() => {
    load();
  }, [load]);

  const selected = policies.find((p) => String(p._id) === selectedId) || policies[0] || null;

  useEffect(() => {
    if (selected && !selectedId) setSelectedId(String(selected._id));
  }, [selected, selectedId]);

  const startStub = async (entityType) => {
    if (!stubProjectId.trim()) {
      toast.error(t('adminTasks.approvalStubNeedProject'));
      return;
    }
    setStubBusy(true);
    try {
      await projectAPI.startStubApproval(orgId, {
        projectId: stubProjectId.trim(),
        entityType,
        entityId: `${entityType}_${Date.now()}`,
      });
      toast.success(t('adminTasks.approvalStubCreated'));
    } catch (error) {
      toast.error(
        resolveApiErrorMessage(error, { t, fallback: t('adminTasks.approvalStubFail') })
      );
    } finally {
      setStubBusy(false);
    }
  };

  return (
    <AdminUserPanelShell
      title={t('adminDomains.projects.approvalPolicies')}
      hint={t('adminTasks.approvalPolicyHint')}
      wide
    >
      {loading && !policies.length ? (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
          <AdminUserFormCard title={t('adminTasks.approvalPolicyList')}>
            <ul className="space-y-1">
              {policies.map((p) => (
                <li key={String(p._id)}>
                  <button
                    type="button"
                    className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${
                      String(p._id) === String(selected?._id)
                        ? 'border-primary/40 bg-primary/10 font-semibold'
                        : 'border-border hover:bg-muted/40'
                    }`}
                    onClick={() => setSelectedId(String(p._id))}
                  >
                    <span className="block truncate">{p.name}</span>
                    <span className="block font-mono text-[10px] text-muted-foreground">
                      {p.key}
                      {p.isBuiltin ? ' · builtin' : ''}
                      {Array.isArray(p.companySizes) && p.companySizes.length
                        ? ` · size: ${p.companySizes.join(',')}`
                        : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className={`${adminSecondaryBtnClass()} mt-3`} onClick={load}>
              {t('common.refresh') || 'Refresh'}
            </button>
          </AdminUserFormCard>

          <div className="space-y-4">
            <AdminUserFormCard title={selected?.name || t('adminTasks.approvalPolicyDetail')}>
              {!selected ? (
                <p className="text-sm text-muted-foreground">{t('adminTasks.approvalPolicyEmpty')}</p>
              ) : (
                <>
                  <p className="mb-3 text-xs text-muted-foreground">{selected.description}</p>
                  <p className="mb-2 text-[11px] font-semibold uppercase text-muted-foreground">
                    Steps
                  </p>
                  <ol className="space-y-2">
                    {(selected.steps || []).map((s, i) => (
                      <li
                        key={`${s.order}-${i}`}
                        className="rounded-lg border border-border px-3 py-2 text-sm"
                      >
                        <span className="font-semibold">{s.order}.</span>{' '}
                        <span className="font-mono text-xs">{s.approverType}</span>
                        {s.roleKey ? (
                          <span className="text-muted-foreground"> · {s.roleKey}</span>
                        ) : null}
                        <span className="ml-2 text-[10px] text-muted-foreground">
                          quorum {s.quorum || 1}
                        </span>
                      </li>
                    ))}
                  </ol>
                  <p className="mt-3 text-[11px] text-muted-foreground">
                    entityTypes: {(selected.entityTypes || []).join(', ')}
                  </p>
                </>
              )}
            </AdminUserFormCard>

            <AdminUserFormCard title={t('adminTasks.approvalStubTitle')}>
              <p className="mb-3 text-xs text-muted-foreground">{t('adminTasks.approvalStubHint')}</p>
              <label className="mb-3 block text-xs">
                projectId
                <input
                  className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
                  value={stubProjectId}
                  onChange={(e) => setStubProjectId(e.target.value)}
                  placeholder="ObjectId project"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={adminPrimaryBtnClass()}
                  disabled={stubBusy}
                  onClick={() => startStub('merge_request')}
                >
                  Stub MR
                </button>
                <button
                  type="button"
                  className={adminSecondaryBtnClass()}
                  disabled={stubBusy}
                  onClick={() => startStub('release')}
                >
                  Stub Release
                </button>
              </div>
            </AdminUserFormCard>
          </div>
        </div>
      )}
    </AdminUserPanelShell>
  );
}
