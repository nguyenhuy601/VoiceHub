import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AdminDenseMobileList,
  AdminUserFormCard,
  AdminUserPanelShell,
  adminDenseRowClass,
  adminInputClass,
  adminLabelClass,
  adminPrimaryBtnClass,
  adminSecondaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import {
  AdminBusySpinner,
  AdminEmptyState,
  AdminListSkeleton,
  AdminLoadErrorState,
} from '../../components/adminUsers/adminPanelStates';
import { useAppStrings } from '../../locales/appStrings';
import {
  AUDIT_FILTER_MAX_LENGTH,
  buildAuditFilterParams,
  hasAuditFilterErrors,
} from './auditFilterParams';
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

const AUDIT_PAGE_SIZE = 80;

const EMPTY_FILTERS = { resourceType: '', action: '', resourceId: '' };

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

function isGovernanceForbidden(error) {
  const data = error?.response?.data;
  return (
    error?.response?.status === 403 ||
    data?.errorCode === 'GOVERNANCE_VIEW_FORBIDDEN' ||
    data?.code === 'GOVERNANCE_VIEW_FORBIDDEN'
  );
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
          <tr key={row.key} className="align-top border-t border-border">
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
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [forbidden, setForbidden] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState('');
  const [draft, setDraft] = useState(EMPTY_FILTERS);
  const [draftErrors, setDraftErrors] = useState({});
  const [appliedParams, setAppliedParams] = useState({});
  const loadSeqRef = useRef(0);

  const isFiltered = Object.keys(appliedParams).length > 0;
  const hasDraftValue = Boolean(draft.resourceType || draft.action.trim() || draft.resourceId.trim());

  const fetchPage = useCallback(
    (before) =>
      projectAPI.listAuditEvents(orgId, {
        limit: AUDIT_PAGE_SIZE,
        ...appliedParams,
        ...(before ? { before } : {}),
      }),
    [orgId, appliedParams]
  );

  const load = useCallback(async () => {
    if (!orgId) return;
    const seq = ++loadSeqRef.current;
    setLoading(true);
    setLoadError('');
    setLoadMoreError('');
    setForbidden(false);
    try {
      const data = unwrap(await fetchPage());
      if (seq !== loadSeqRef.current) return;
      const list = Array.isArray(data) ? data : [];
      setRows(list);
      setHasMore(list.length >= AUDIT_PAGE_SIZE);
    } catch (error) {
      if (seq !== loadSeqRef.current) return;
      if (isGovernanceForbidden(error)) {
        setForbidden(true);
        setRows([]);
        setHasMore(false);
      } else {
        setLoadError(resolveApiErrorMessage(error, { t, fallback: t('adminTasks.auditLoadFail') }));
      }
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  }, [orgId, fetchPage, t]);

  const loadMore = async () => {
    const last = rows[rows.length - 1];
    if (!orgId || !last?.createdAt || loadingMore || loading) return;
    const seq = loadSeqRef.current;
    setLoadingMore(true);
    setLoadMoreError('');
    try {
      const data = unwrap(await fetchPage(new Date(last.createdAt).toISOString()));
      if (seq !== loadSeqRef.current) return;
      const list = Array.isArray(data) ? data : [];
      setRows((prev) => [...prev, ...list]);
      setHasMore(list.length >= AUDIT_PAGE_SIZE);
    } catch (error) {
      if (seq !== loadSeqRef.current) return;
      setLoadMoreError(resolveApiErrorMessage(error, { t, fallback: t('adminAudit.loadMoreFail') }));
    } finally {
      if (seq === loadSeqRef.current) setLoadingMore(false);
    }
  };

  const updateDraft = (key, value) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    if (draftErrors[key]) setDraftErrors((prev) => ({ ...prev, [key]: false }));
  };

  const applyFilters = (event) => {
    event?.preventDefault();
    const { params, errors } = buildAuditFilterParams(draft);
    setDraftErrors(errors);
    if (hasAuditFilterErrors(errors)) return;
    setRows([]);
    setHasMore(false);
    setAppliedParams(params);
  };

  const clearFilters = () => {
    setDraft(EMPTY_FILTERS);
    setDraftErrors({});
    setRows([]);
    setHasMore(false);
    setAppliedParams({});
  };

  useEffect(() => {
    load();
    return () => {
      loadSeqRef.current += 1;
    };
  }, [load]);

  const eventKey = (ev) => String(ev._id || `${ev.action}-${ev.createdAt}`);
  const techDetails = (ev) => (
    <details className="mt-2">
      <summary className="cursor-pointer rounded text-xs font-medium text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {t('adminAudit.techDetails')}
      </summary>
      <pre className="mt-1 max-h-28 overflow-auto rounded bg-muted p-2 text-[10px] leading-snug">
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
  );

  return (
    <AdminUserPanelShell title={t('adminDomains.audit.log')} hint={t('adminAudit.hint')} wide>
      <form className="mb-3 flex flex-wrap items-start gap-2" onSubmit={applyFilters} noValidate>
        <label className={`${adminLabelClass()} min-w-[10rem]`}>
          {t('adminAudit.filterResourceType')}
          <select
            className={adminInputClass('mt-1 font-normal')}
            value={draft.resourceType}
            onChange={(e) => updateDraft('resourceType', e.target.value)}
            disabled={forbidden}
          >
            <option value="">{t('adminAudit.filterAll')}</option>
            {AUDIT_RESOURCE_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {t(opt.labelKey)}
              </option>
            ))}
          </select>
        </label>
        <label className={`${adminLabelClass()} min-w-[12rem] flex-1 sm:flex-none`}>
          {t('adminAudit.filterAction')}
          <input
            type="search"
            className={adminInputClass('mt-1 font-mono font-normal')}
            value={draft.action}
            onChange={(e) => updateDraft('action', e.target.value)}
            placeholder={t('adminAudit.filterActionPlaceholder')}
            maxLength={AUDIT_FILTER_MAX_LENGTH}
            aria-label={t('adminAudit.filterAction')}
            aria-invalid={draftErrors.action || undefined}
            aria-describedby={draftErrors.action ? 'audit-filter-action-error' : undefined}
            disabled={forbidden}
            autoComplete="off"
            spellCheck={false}
          />
          {draftErrors.action ? (
            <span id="audit-filter-action-error" role="alert" className="mt-1 block text-xs font-normal text-destructive">
              {t('adminAudit.filterActionInvalid')}
            </span>
          ) : null}
        </label>
        <label className={`${adminLabelClass()} min-w-[12rem] flex-1 sm:flex-none`}>
          {t('adminAudit.filterResourceId')}
          <input
            type="search"
            className={adminInputClass('mt-1 font-mono font-normal')}
            value={draft.resourceId}
            onChange={(e) => updateDraft('resourceId', e.target.value)}
            placeholder={t('adminAudit.filterResourceIdPlaceholder')}
            maxLength={AUDIT_FILTER_MAX_LENGTH}
            aria-label={t('adminAudit.filterResourceId')}
            aria-invalid={draftErrors.resourceId || undefined}
            aria-describedby={draftErrors.resourceId ? 'audit-filter-resource-id-error' : undefined}
            disabled={forbidden}
            autoComplete="off"
            spellCheck={false}
          />
          {draftErrors.resourceId ? (
            <span
              id="audit-filter-resource-id-error"
              role="alert"
              className="mt-1 block text-xs font-normal text-destructive"
            >
              {t('adminAudit.filterResourceIdInvalid')}
            </span>
          ) : null}
        </label>
        <div className="flex flex-wrap gap-2 self-end">
          <button type="submit" className={adminPrimaryBtnClass()} disabled={loading || forbidden}>
            {t('adminAudit.filterApply')}
          </button>
          <button
            type="button"
            className={adminSecondaryBtnClass()}
            onClick={clearFilters}
            disabled={loading || forbidden || (!isFiltered && !hasDraftValue)}
          >
            {t('adminAudit.filterClear')}
          </button>
          <button
            type="button"
            className={adminSecondaryBtnClass()}
            onClick={load}
            disabled={loading || forbidden}
            aria-busy={loading || undefined}
          >
            <AdminBusySpinner busy={loading} />
            {t('adminAudit.refresh')}
          </button>
        </div>
      </form>
      <AdminUserFormCard title={t('adminTasks.auditListTitle')}>
        {forbidden ? (
          <p role="alert" className="rounded-xl border border-warning bg-warning-bg px-3 py-2 text-sm text-warning">
            {t('adminAudit.forbidden')}
          </p>
        ) : loadError ? (
          <AdminLoadErrorState message={loadError} onRetry={load} disabled={loading} />
        ) : loading && !rows.length ? (
          <AdminListSkeleton />
        ) : !rows.length ? (
          <AdminEmptyState
            message={isFiltered ? t('adminAudit.emptyFiltered') : t('adminTasks.auditEmpty')}
            action={
              isFiltered ? (
                <button type="button" className={adminSecondaryBtnClass()} onClick={clearFilters}>
                  {t('adminAudit.filterClear')}
                </button>
              ) : null
            }
          />
        ) : (
          <div aria-busy={loading || undefined}>
            <div className="hidden max-h-[70vh] overflow-auto md:block">
              <table className="w-full min-w-[40rem] text-left text-sm">
                <thead className="sticky top-0 bg-card text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-3 py-2.5">{t('adminAudit.colTime')}</th>
                    <th scope="col" className="px-3 py-2.5">{t('adminAudit.colAction')}</th>
                    <th scope="col" className="px-3 py-2.5">{t('adminAudit.colResourceType')}</th>
                    <th scope="col" className="px-3 py-2.5">{t('adminAudit.colChanges')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((ev) => (
                    <tr key={eventKey(ev)} className={adminDenseRowClass('align-top')}>
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
                        {techDetails(ev)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <AdminDenseMobileList
              items={rows}
              getKey={eventKey}
              ariaLabel={t('adminTasks.auditListTitle')}
              renderTitle={(ev) => actionLabel(t, ev.action)}
              renderMeta={(ev) =>
                [formatEventTime(ev.createdAt, locale), resourceTypeLabel(t, ev.resourceType)]
                  .filter(Boolean)
                  .join(' · ')
              }
              renderActions={(ev) => (
                <div className="w-full min-w-0">
                  <AuditFieldDiff before={ev.before} after={ev.after} t={t} locale={locale} />
                  {techDetails(ev)}
                </div>
              )}
            />
            {loadMoreError ? (
              <AdminLoadErrorState
                className="mt-3"
                message={loadMoreError}
                onRetry={loadMore}
                disabled={loadingMore || loading}
              />
            ) : hasMore ? (
              <div className="mt-3 flex justify-center">
                <button
                  type="button"
                  className={adminSecondaryBtnClass()}
                  onClick={loadMore}
                  disabled={loadingMore || loading}
                  aria-busy={loadingMore || undefined}
                >
                  <AdminBusySpinner busy={loadingMore} />
                  {t('adminAudit.loadMore')}
                </button>
              </div>
            ) : null}
          </div>
        )}
      </AdminUserFormCard>
      <p className="mt-3 text-xs text-muted-foreground">{t('adminTasks.auditAppendOnly')}</p>
    </AdminUserPanelShell>
  );
}
