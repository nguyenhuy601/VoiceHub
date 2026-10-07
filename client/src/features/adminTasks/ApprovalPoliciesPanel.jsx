import { useCallback, useEffect, useState } from 'react';
import {
  AdminUserFormCard,
  AdminUserPanelShell,
  adminSecondaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import {
  AdminBusySpinner,
  AdminEmptyState,
  AdminListSkeleton,
  AdminLoadErrorState,
} from '../../components/adminUsers/adminPanelStates';
import { useAppStrings } from '../../locales/appStrings';
import { projectAPI } from '../../services/api/projectAPI';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

/**
 * Admin — Approval Policy catalog (read-only).
 */
export default function ApprovalPoliciesPanel({ orgId }) {
  const { t } = useAppStrings();
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [selectedId, setSelectedId] = useState('');

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setLoadError('');
    try {
      const res = await projectAPI.listApprovalPolicies(orgId);
      const list = unwrap(res);
      setPolicies(Array.isArray(list) ? list : []);
    } catch (error) {
      setLoadError(
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

  let body;
  if (loading) {
    body = <AdminListSkeleton rows={5} />;
  } else if (loadError) {
    body = <AdminLoadErrorState message={loadError} onRetry={load} disabled={loading} />;
  } else if (!policies.length) {
    body = <AdminEmptyState message={t('adminTasks.approvalPolicyEmpty')} />;
  } else {
    body = (
      <div className="grid gap-4 lg:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
        <AdminUserFormCard title={t('adminTasks.approvalPolicyList')}>
          <ul className="space-y-1">
            {policies.map((p) => {
              const isSelected = String(p._id) === String(selected?._id);
              return (
                <li key={String(p._id)}>
                  <button
                    type="button"
                    className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98] motion-reduce:active:scale-100 ${
                      isSelected
                        ? 'border-primary bg-primary-subtle font-semibold'
                        : 'border-border hover:bg-muted'
                    }`}
                    aria-pressed={isSelected}
                    onClick={() => setSelectedId(String(p._id))}
                  >
                    <span className="block truncate">{p.name}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
                      <span>{p.key}</span>
                      {p.isBuiltin ? (
                        <span className="rounded border border-border bg-muted px-1.5 py-0.5 font-sans text-[10px] font-medium text-muted-foreground">
                          {t('adminTasks.approvalPolicyBuiltin')}
                        </span>
                      ) : null}
                      {Array.isArray(p.companySizes) && p.companySizes.length ? (
                        <span className="rounded border border-border bg-muted px-1.5 py-0.5 font-sans text-[10px] font-medium text-muted-foreground">
                          {t('adminTasks.approvalPolicySize', {
                            sizes: p.companySizes.join(', '),
                          })}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            className={`${adminSecondaryBtnClass()} mt-3`}
            disabled={loading}
            aria-busy={loading}
            onClick={() => void load()}
          >
            <AdminBusySpinner busy={loading} />
            {t('common.refresh')}
          </button>
        </AdminUserFormCard>

        <AdminUserFormCard title={selected?.name || t('adminTasks.approvalPolicyDetail')}>
          {!selected ? (
            <p className="text-sm text-muted-foreground">{t('adminTasks.approvalPolicyEmpty')}</p>
          ) : (
            <>
              <p className="mb-3 text-xs text-muted-foreground">{selected.description}</p>
              <p className="mb-2 text-[11px] font-semibold uppercase text-muted-foreground">
                {t('adminTasks.approvalPolicySteps')}
              </p>
              <ol className="space-y-2">
                {(selected.steps || []).map((s, i) => (
                  <li
                    key={`${s.order}-${i}`}
                    className="rounded-lg border border-border px-3 py-2 text-sm transition-colors duration-150 hover:bg-muted motion-reduce:transition-none"
                  >
                    <span className="font-semibold">{s.order}.</span>{' '}
                    <span className="font-mono text-xs">{s.approverType}</span>
                    {s.roleKey ? (
                      <span className="text-muted-foreground"> · {s.roleKey}</span>
                    ) : null}
                    <span className="ml-2 text-[10px] text-muted-foreground">
                      {t('adminTasks.approvalPolicyQuorum', { n: s.quorum || 1 })}
                    </span>
                  </li>
                ))}
              </ol>
              <p className="mt-3 text-[11px] text-muted-foreground">
                {t('adminTasks.approvalPolicyEntityTypes', {
                  types: (selected.entityTypes || []).join(', '),
                })}
              </p>
              <p className="mt-3 text-xs text-muted-foreground">
                {t('adminTasks.approvalPolicyAssignHint')}
              </p>
            </>
          )}
        </AdminUserFormCard>
      </div>
    );
  }

  return (
    <AdminUserPanelShell
      title={t('adminDomains.projects.approvalPolicies')}
      hint={t('adminTasks.approvalPolicyHint')}
      wide
    >
      {body}
    </AdminUserPanelShell>
  );
}
