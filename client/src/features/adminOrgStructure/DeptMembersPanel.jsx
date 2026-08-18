/** Quản lý nhiều members trong một phòng ban (1 user ↔ 1 phòng, enforce BE). */
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import AdminOrgUnitPicker from '../../components/adminOrgStructure/AdminOrgUnitPicker';
import {
  AdminUserFormCard,
  AdminUserPanelShell,
  adminPrimaryBtnClass,
  adminSecondaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import { organizationAPI } from '../../services/api/organizationAPI';
import useAdminOrgStructure from '../../hooks/useAdminOrgStructure';
import useAdminMembers from '../../hooks/useAdminMembers';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { departmentHeadId, unitId, unitName } from '../../utils/adminOrgStructureUtils';
import {
  memberDepartmentId,
  memberDisplayName,
  memberEmail,
  memberUserId,
} from '../../utils/adminUserUtils';

export default function DeptMembersPanel({ orgId, embedded = false }) {
  const { t } = useAppStrings();
  const [searchParams] = useSearchParams();
  const unitParam = String(searchParams.get('unitId') || '').trim();
  const { departments, loading, error: structureError, loadStructure } = useAdminOrgStructure(orgId);
  const {
    members,
    loading: membersLoading,
    error: membersError,
    loadMembers,
  } = useAdminMembers(orgId);
  const [selectedId, setSelectedId] = useState(unitParam);
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [saving, setSaving] = useState(false);

  const selected = useMemo(
    () => departments.find((row) => unitId(row) === selectedId) || null,
    [departments, selectedId]
  );
  const headId = selected ? departmentHeadId(selected) : '';

  useEffect(() => {
    if (unitParam) setSelectedId(unitParam);
  }, [unitParam]);

  useEffect(() => {
    const ids = [...(selected?.memberIds || [])];
    const hid = selected ? departmentHeadId(selected) : '';
    if (hid && !ids.includes(hid)) ids.push(hid);
    setSelectedMembers(ids);
  }, [selected]);

  const toggle = (id) => {
    if (headId && id === headId && selectedMembers.includes(id)) {
      toast.error(t('adminOrg.deptMembersCannotRemoveHead'));
      return;
    }
    setSelectedMembers((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const save = async () => {
    if (!orgId || !selectedId || saving) return;
    const payloadMembers =
      headId && !selectedMembers.includes(headId)
        ? [...selectedMembers, headId]
        : selectedMembers;
    if (headId && !payloadMembers.includes(headId)) {
      toast.error(t('adminOrg.deptMembersCannotRemoveHead'));
      return;
    }
    setSaving(true);
    try {
      await organizationAPI.updateDepartment(orgId, selectedId, {
        members: payloadMembers,
      });
      toast.success(t('adminOrg.saved'));
      await loadStructure();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminOrg.saveFail') }));
    } finally {
      setSaving(false);
    }
  };

  const body = (
    <AdminUserFormCard title={unitName(selected) || t('adminDomains.orgStructure.deptMembers')}>
      {structureError || membersError ? (
        <div className="space-y-3">
          <p className="rounded-xl border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {structureError || resolveApiErrorMessage(membersError, { t, fallback: t('adminOrg.loadFail') })}
          </p>
          <button
            type="button"
            className={adminPrimaryBtnClass()}
            onClick={() => Promise.allSettled([loadStructure(), loadMembers()])}
          >
            {t('adminRbac.retry')}
          </button>
        </div>
      ) : !selected ? (
        <p className="text-sm text-muted-foreground">{t('adminOrg.selectUnitFirst')}</p>
      ) : membersLoading ? (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : (
        <div className="space-y-4">
          {headId ? (
            <p className="text-xs text-muted-foreground">
              {t('adminOrg.deptMembersHeadNote')}{' '}
              <Link
                className="underline"
                to={`/app/admin/org-structure/departments/head?unitId=${encodeURIComponent(selectedId)}`}
              >
                {t('adminDomains.orgStructure.deptHead')}
              </Link>
            </p>
          ) : (
            <p className="text-xs text-amber-700">{t('adminOrg.deptMembersNoHead')}</p>
          )}
          <div className="max-h-[420px] overflow-auto rounded-xl border border-border/70">
            <ul className="divide-y divide-border/50">
              {members.map((m) => {
                const id = memberUserId(m);
                const checked = selectedMembers.includes(id);
                const otherDept = memberDepartmentId(m);
                const inOther =
                  otherDept && otherDept !== selectedId && !checked;
                return (
                  <li key={id}>
                    <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-muted/30">
                      <input
                        type="checkbox"
                        className="rounded border-border"
                        checked={checked}
                        onChange={() => toggle(id)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">
                          {memberDisplayName(m)}
                          {headId === id ? (
                            <span className="ml-1.5 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-700">
                              Head
                            </span>
                          ) : null}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {memberEmail(m)}
                          {inOther
                            ? ` · ${t('adminOrg.deptMembersWillMove')}`
                            : ''}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={adminPrimaryBtnClass()}
              disabled={saving}
              onClick={save}
            >
              {saving ? t('common.saving') : t('common.save')}
            </button>
            <Link
              to={`/app/admin/org-structure/departments/org-roles?unitId=${encodeURIComponent(selectedId)}`}
              className={adminSecondaryBtnClass()}
            >
              {t('adminDomains.orgStructure.deptOrgRoles')}
            </Link>
          </div>
        </div>
      )}
    </AdminUserFormCard>
  );

  if (embedded) return body;

  return (
    <AdminUserPanelShell
      title={t('adminDomains.orgStructure.deptMembers')}
      hint={t('adminOrg.deptMembersHint')}
      wide
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        <AdminOrgUnitPicker
          items={departments}
          loading={loading}
          error={structureError}
          onRetry={() => loadStructure()}
          selectedId={selectedId}
          onSelect={setSelectedId}
          hint={t('adminOrg.deptMembersPickerHint')}
          subtitleFn={(row) =>
            t('adminOrg.deptMembersCount', {
              n: (row.memberIds || []).length,
              defaultValue: `${(row.memberIds || []).length} members`,
            })
          }
        />
        {body}
      </div>
    </AdminUserPanelShell>
  );
}
