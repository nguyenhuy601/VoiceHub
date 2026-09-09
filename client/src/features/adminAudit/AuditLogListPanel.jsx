import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  AdminUserFormCard,
  AdminUserPanelShell,
  adminLabelClass,
  adminSecondaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import { useAppStrings } from '../../locales/appStrings';
import { projectAPI } from '../../services/api/projectAPI';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import {
  AUDIT_RESOURCE_TYPE_OPTIONS,
  actionLabel,
  buildFieldDiff,
  fieldLabel,
  formatAuditValue,
  redactAuditTree,
  resourceTypeLabel,
} from './auditLogDisplay';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

function formatEventTime(value, locale) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function AuditFieldDiff({ before, after, t, locale }) {
  const rows = buildFieldDiff(before, after);
  if (!rows.length) {
    return <p className="text-xs text-muted-foreground">{t('adminAudit.noDiff')}</p>;
  }
  return (
    <table className="w-full text-left text-xs">
      <thead>
        <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
          <th className="py-1 pr-2 font-semibold">{t('adminAudit.diffField')}</th>
          <th className="py-1 pr-2 font-semibold">{t('adminAudit.diffBefore')}</th>
          <th className="py-1 font-semibold">{t('adminAudit.diffAfter')}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key} className="align-top border-t border-border/40">
            <td className="py-1 pr-2 font-medium text-foreground">{fieldLabel(t, row.key)}</td>
            <td className="py-1 pr-2 text-muted-foreground break-all">
              {formatAuditValue(row.before, t, locale, row.key)}
            </td>
            <td className="py-1 text-foreground break-all">
              {formatAuditValue(row.after, t, locale, row.key)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Admin — org-wide AuditEvent list (append-only). GET /projects/audit-events only.
 */
export default function AuditLogListPanel({ orgId }) {
  const { t, locale } = useAppStrings();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [resourceType, setResourceType] = useState('');
  const loadSeqRef = useRef(0);

  const load = useCallback(async () => {
    if (!orgId) return;
    const seq = ++loadSeqRef.current;
    setLoading(true);
    try {
      const res = await projectAPI.listAuditEvents(orgId, {
        limit: 80,
        ...(resourceType ? { resourceType } : {}),
      });
      if (seq !== loadSeqRef.current) return;
      const data = unwrap(res);
      setRows(Array.isArray(data) ? data : []);
    } catch (error) {
      if (seq !== loadSeqRef.current) return;
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminTasks.auditLoadFail') }));
      setRows([]);
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  }, [orgId, resourceType, t]);

  useEffect(() => {
    load();
    return () => {
      loadSeqRef.current += 1;
    };
  }, [load]);

  return (
    <AdminUserPanelShell title={t('adminDomains.audit.log')} hint={t('adminAudit.hint')} wide>
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <label className={adminLabelClass()}>
          {t('adminAudit.filterResourceType')}
          <select
            className="mt-1 block rounded-lg border border-border bg-background px-2 py-1.5 text-sm font-normal text-foreground"
            value={resourceType}
            onChange={(e) => setResourceType(e.target.value)}
          >
            <option value="">{t('adminAudit.filterAll')}</option>
            {AUDIT_RESOURCE_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {t(opt.labelKey)}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className={adminSecondaryBtnClass()} onClick={load} disabled={loading}>
          {loading ? t('common.loading') : t('adminAudit.refresh')}
        </button>
      </div>
      <AdminUserFormCard title={t('adminTasks.auditListTitle')}>
        {!rows.length ? (
          <p className="text-sm text-muted-foreground">
            {loading ? t('common.loading') : t('adminTasks.auditEmpty')}
          </p>
        ) : (
          <div className="max-h-[70vh] overflow-auto">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="sticky top-0 bg-card text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2.5">{t('adminAudit.colTime')}</th>
                  <th className="px-3 py-2.5">{t('adminAudit.colAction')}</th>
                  <th className="px-3 py-2.5">{t('adminAudit.colResourceType')}</th>
                  <th className="px-3 py-2.5">{t('adminAudit.colChanges')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {rows.map((ev) => {
                  const eventId = String(ev._id || `${ev.action}-${ev.createdAt}`);
                  return (
                    <tr key={eventId} className="align-top hover:bg-muted/20">
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs text-muted-foreground">
                        {formatEventTime(ev.createdAt, locale) || t('adminAudit.emptyValue')}
                      </td>
                      <td className="px-3 py-2.5 font-medium">{actionLabel(t, ev.action)}</td>
                      <td className="px-3 py-2.5">
                        <p>{resourceTypeLabel(t, ev.resourceType)}</p>
                        {ev.resourceId ? (
                          <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                            {t('adminAudit.resourceId')}: {String(ev.resourceId)}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-3 py-2.5">
                        <AuditFieldDiff before={ev.before} after={ev.after} t={t} locale={locale} />
                        <details className="mt-2">
                          <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                            {t('adminAudit.techDetails')}
                          </summary>
                          <pre className="mt-1 max-h-28 overflow-auto rounded bg-muted/40 p-2 text-[10px] leading-snug">
                            {JSON.stringify(
                              redactAuditTree(
                                {
                                  action: ev.action,
                                  resourceType: ev.resourceType,
                                  resourceId: ev.resourceId,
                                  actorUserId: ev.actorUserId,
                                  before: ev.before,
                                  after: ev.after,
                                  meta: ev.meta,
                                },
                                t
                              ),
                              null,
                              2
                            )}
                          </pre>
                        </details>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </AdminUserFormCard>
      <p className="mt-3 text-xs text-muted-foreground">{t('adminTasks.auditAppendOnly')}</p>
    </AdminUserPanelShell>
  );
}
