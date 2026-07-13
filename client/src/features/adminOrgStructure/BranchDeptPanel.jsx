/** Huy: Domain Cơ cấu tổ chức — admin org-structure */
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import AdminOrgUnitPicker from '../../components/adminOrgStructure/AdminOrgUnitPicker';
import {
  AdminUserFormCard,
  AdminUserPanelShell,
} from '../../components/adminUsers/adminUserPanelUi';
import useAdminOrgStructure from '../../hooks/useAdminOrgStructure';
import { useAppStrings } from '../../locales/appStrings';
import { unitId, unitName } from '../../utils/adminOrgStructureUtils';

export default function BranchDeptPanel({ orgId }) {
  const { t } = useAppStrings();
  const [searchParams] = useSearchParams();
  const unitParam = String(searchParams.get('unitId') || '').trim();
  const { branches, departments, loading } = useAdminOrgStructure(orgId);
  const [selectedId, setSelectedId] = useState(unitParam);

  useEffect(() => {
    if (unitParam) setSelectedId(unitParam);
  }, [unitParam]);

  const selected = useMemo(
    () => branches.find((row) => unitId(row) === selectedId) || null,
    [branches, selectedId]
  );

  const deptRows = useMemo(() => {
    if (!selectedId) return [];
    return departments.filter((d) => String(d.branchId || '') === selectedId);
  }, [departments, selectedId]);

  return (
    <AdminUserPanelShell
      title={t('adminDomains.orgStructure.branchDept')}
      hint={t('adminOrg.branchDeptHint')}
      wide
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:items-start">
        <AdminOrgUnitPicker
          items={branches}
          loading={loading}
          selectedId={selectedId}
          onSelect={setSelectedId}
          hint={t('adminOrg.branchDeptPickerHint')}
          subtitleFn={(row) => row.location || ''}
        />
        <AdminUserFormCard title={t('adminOrg.branchDeptTableTitle')}>
          {!selected ? (
            <p className="text-sm text-muted-foreground">{t('adminOrg.selectUnitFirst')}</p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3">{t('adminOrg.colName')}</th>
                    <th className="px-4 py-3">{t('adminOrg.colDivision')}</th>
                    <th className="px-4 py-3">{t('adminOrg.colTeams')}</th>
                  </tr>
                </thead>
                <tbody>
                  {deptRows.map((row) => (
                    <tr key={unitId(row)} className="border-b border-border/50">
                      <td className="px-4 py-3 font-medium text-foreground">{unitName(row)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{row.divisionName || '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">{row.teamCount ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!deptRows.length ? (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                  {t('adminOrg.branchDeptEmpty')}
                </p>
              ) : null}
            </div>
          )}
        </AdminUserFormCard>
      </div>
    </AdminUserPanelShell>
  );
}
