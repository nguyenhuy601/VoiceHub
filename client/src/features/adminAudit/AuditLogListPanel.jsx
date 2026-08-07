import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  AdminUserFormCard,
  AdminUserPanelShell,
  adminSecondaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import { useAppStrings } from '../../locales/appStrings';
import { projectAPI } from '../../services/api/projectAPI';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

/**
 * Admin — org-wide AuditEvent list (append-only).
 */
export default function AuditLogListPanel({ orgId }) {
  const { t } = useAppStrings();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [resourceType, setResourceType] = useState('');

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const res = await projectAPI.listAuditEvents(orgId, {
        limit: 80,
        ...(resourceType ? { resourceType } : {}),
      });
      const data = unwrap(res);
      setRows(Array.isArray(data) ? data : []);
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminTasks.auditLoadFail') }));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [orgId, resourceType, t]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <AdminUserPanelShell title={t('adminDomains.audit.log')} hint={t('adminTasks.auditHint')} wide>
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <label className="text-xs font-semibold text-muted-foreground">
          resourceType
          <select
            className="mt-1 block rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
            value={resourceType}
            onChange={(e) => setResourceType(e.target.value)}
          >
            <option value="">—</option>
            <option value="project">project</option>
            <option value="task">task</option>
            <option value="project_member">project_member</option>
            <option value="approval">approval</option>
            <option value="master_data">master_data</option>
            <option value="project_role">project_role</option>
            <option value="governance_settings">governance_settings</option>
          </select>
        </label>
        <button type="button" className={adminSecondaryBtnClass()} onClick={load} disabled={loading}>
          {loading ? '…' : t('common.refresh') || 'Refresh'}
        </button>
      </div>
      <AdminUserFormCard title={t('adminTasks.auditListTitle')}>
        {!rows.length ? (
          <p className="text-sm text-muted-foreground">{t('adminTasks.auditEmpty')}</p>
        ) : (
          <ul className="max-h-[70vh] space-y-2 overflow-y-auto">
            {rows.map((ev) => (
              <li key={String(ev._id)} className="rounded-lg border border-border px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <span className="font-semibold">{ev.action}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {ev.createdAt ? new Date(ev.createdAt).toLocaleString() : ''}
                  </span>
                </div>
                <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                  {ev.resourceType}/{ev.resourceId}
                </p>
                {(ev.before || ev.after) && (
                  <pre className="mt-2 max-h-28 overflow-auto rounded bg-muted/40 p-2 text-[10px] leading-snug">
                    {JSON.stringify({ before: ev.before, after: ev.after }, null, 2)}
                  </pre>
                )}
              </li>
            ))}
          </ul>
        )}
      </AdminUserFormCard>
      <p className="mt-3 text-xs text-muted-foreground">{t('adminTasks.auditAppendOnly')}</p>
    </AdminUserPanelShell>
  );
}
