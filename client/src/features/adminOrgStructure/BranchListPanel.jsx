/** Huy: Domain Cơ cấu tổ chức — admin org-structure */
import { Link } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  AdminUserPanelShell,
  adminInputClass,
  adminPrimaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import { organizationAPI } from '../../services/api/organizationAPI';
import useAdminOrgStructure from '../../hooks/useAdminOrgStructure';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { unitId, unitName, unwrapOrgApi } from '../../utils/adminOrgStructureUtils';

const ACTION_LINKS = [
  { path: '/app/admin/org-structure/branches/edit', labelKey: 'adminDomains.orgStructure.branchEdit' },
  { path: '/app/admin/org-structure/branches/disable', labelKey: 'adminDomains.orgStructure.branchDisable' },
  { path: '/app/admin/org-structure/branches/departments', labelKey: 'adminDomains.orgStructure.branchDept' },
];

export default function BranchListPanel({ orgId }) {
  const { t } = useAppStrings();
  const { branches: structureBranches, loading: structureLoading } = useAdminOrgStructure(orgId);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!orgId) return undefined;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await organizationAPI.getBranches(orgId, { includeInactive: true });
        const data = unwrapOrgApi(res);
        const list = Array.isArray(data) ? data : data?.branches || [];
        if (!cancelled) setBranches(Array.isArray(list) ? list : []);
      } catch (error) {
        if (!cancelled) {
          setBranches([]);
          toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminOrg.loadFail') }));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId, t]);

  const rows = branches.length ? branches : structureBranches;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const id = unitId(row);
      return (
        unitName(row).toLowerCase().includes(q) ||
        String(row.location || '').toLowerCase().includes(q) ||
        id.toLowerCase().includes(q)
      );
    });
  }, [rows, query]);

  const busy = loading || structureLoading;

  return (
    <AdminUserPanelShell
      title={t('adminDomains.orgStructure.branchList')}
      hint={t('adminOrg.branchListHint')}
      wide
      actions={
        <Link to="/app/admin/org-structure/branches/create" className={adminPrimaryBtnClass()}>
          <Plus className="h-4 w-4" />
          {t('adminDomains.orgStructure.branchCreate')}
        </Link>
      }
    >
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('adminOrg.searchPlaceholder')}
            className={`${adminInputClass()} pl-9`}
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        {busy ? (
          <p className="px-4 py-8 text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="sticky top-0 border-b border-border bg-muted/30 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3">{t('adminOrg.colName')}</th>
                  <th className="px-4 py-3">{t('adminOrg.colLocation')}</th>
                  <th className="px-4 py-3">{t('adminOrg.colStatus')}</th>
                  <th className="px-4 py-3">{t('adminOrg.colActions')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const id = unitId(row);
                  const active = row.isActive !== false;
                  return (
                    <tr key={id} className="border-b border-border/50 transition hover:bg-muted/20">
                      <td className="px-4 py-3 font-medium text-foreground">{unitName(row)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{row.location || '—'}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                            active
                              ? 'bg-emerald-500/12 text-emerald-700 ring-1 ring-emerald-500/20 dark:text-emerald-300'
                              : 'bg-slate-500/12 text-slate-700 ring-1 ring-slate-500/20 dark:text-slate-300'
                          }`}
                        >
                          {active ? t('adminOrg.active') : t('adminOrg.inactive')}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {ACTION_LINKS.map((link) => (
                            <Link
                              key={link.path}
                              to={`${link.path}?unitId=${encodeURIComponent(id)}`}
                              className="rounded border border-border px-2 py-0.5 text-xs hover:bg-muted/40"
                            >
                              {t(link.labelKey)}
                            </Link>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!filtered.length ? (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                {t('adminOrg.noBranches')}
              </p>
            ) : null}
          </div>
        )}
      </div>
    </AdminUserPanelShell>
  );
}
