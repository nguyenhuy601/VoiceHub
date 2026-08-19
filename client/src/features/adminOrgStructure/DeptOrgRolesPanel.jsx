/**
 * Gán Org Role catalog cho members trong phòng.
 * Trưởng phòng (head) vẫn có thể đặt qua checkbox «Trưởng phòng» (setHead).
 */
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
import { orgRoleCatalogAPI } from '../../services/api/orgRoleCatalogAPI';
import useAdminOrgStructure from '../../hooks/useAdminOrgStructure';
import useAdminMembers from '../../hooks/useAdminMembers';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { departmentHeadId, unitId, unitName } from '../../utils/adminOrgStructureUtils';
import { memberDisplayName } from '../../utils/adminUserUtils';

function unique(arr) {
  return [...new Set((arr || []).map((x) => String(x).trim()).filter(Boolean))];
}

export default function DeptOrgRolesPanel({ orgId }) {
  const { t } = useAppStrings();
  const [searchParams] = useSearchParams();
  const unitParam = String(searchParams.get('unitId') || '').trim();
  const { departments, loading, loadStructure } = useAdminOrgStructure(orgId);
  const { membersByIdAll } = useAdminMembers(orgId);

  const [selectedId, setSelectedId] = useState(unitParam);
  const [catalog, setCatalog] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [assignedKeys, setAssignedKeys] = useState([]);
  const [makeHead, setMakeHead] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadingAssign, setLoadingAssign] = useState(false);

  const selected = useMemo(
    () => departments.find((row) => unitId(row) === selectedId) || null,
    [departments, selectedId]
  );
  const memberIds = selected?.memberIds || [];
  const headId = selected ? departmentHeadId(selected) : '';

  useEffect(() => {
    if (unitParam) setSelectedId(unitParam);
  }, [unitParam]);

  useEffect(() => {
    if (!memberIds.includes(selectedUserId)) {
      setSelectedUserId(memberIds[0] || '');
    }
  }, [memberIds, selectedUserId]);

  useEffect(() => {
    setMakeHead(Boolean(selectedUserId && headId && selectedUserId === headId));
  }, [selectedUserId, headId]);

  useEffect(() => {
    if (!orgId) return;
    (async () => {
      try {
        const res = await orgRoleCatalogAPI.listCatalog(orgId);
        setCatalog(res?.data?.roles || res?.data?.data?.roles || []);
      } catch (error) {
        toast.error(resolveApiErrorMessage(error, { t, fallback: t('common.loadFail') }));
        setCatalog([]);
      }
    })();
  }, [orgId, t]);

  useEffect(() => {
    if (!orgId || !selectedUserId) {
      setAssignedKeys([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingAssign(true);
      try {
        const res = await orgRoleCatalogAPI.listAssignments(orgId, { userId: selectedUserId });
        const items = res?.data?.assignments || res?.data?.data?.assignments || [];
        if (!cancelled) {
          setAssignedKeys(unique(items.map((x) => x.roleKey).filter((k) => k !== 'department_manager')));
        }
      } catch (error) {
        if (!cancelled) {
          toast.error(resolveApiErrorMessage(error, { t, fallback: t('common.loadFail') }));
          setAssignedKeys([]);
        }
      } finally {
        if (!cancelled) setLoadingAssign(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId, selectedUserId, t]);

  const toggleKey = (key) => {
    setAssignedKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const save = async () => {
    if (!orgId || !selectedId || !selectedUserId || busy) return;
    setBusy(true);
    try {
      await orgRoleCatalogAPI.setAssignments(orgId, selectedUserId, unique(assignedKeys));

      const wasHead = headId === selectedUserId;
      if (makeHead && !wasHead) {
        await organizationAPI.updateDepartment(orgId, selectedId, { head: selectedUserId });
      } else if (!makeHead && wasHead) {
        await organizationAPI.updateDepartment(orgId, selectedId, { head: null });
      }

      toast.success(t('adminOrg.saved'));
      await loadStructure();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminOrg.saveFail') }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminUserPanelShell
      title={t('adminDomains.orgStructure.deptOrgRoles')}
      hint={t('adminOrg.deptOrgRolesHint')}
      wide
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        <AdminOrgUnitPicker
          items={departments}
          loading={loading}
          selectedId={selectedId}
          onSelect={setSelectedId}
          hint={t('adminOrg.deptOrgRolesPickerHint')}
          subtitleFn={(row) => `${(row.memberIds || []).length} members`}
        />
        <AdminUserFormCard title={unitName(selected) || t('adminDomains.orgStructure.deptOrgRoles')}>
          {!selected ? (
            <p className="text-sm text-muted-foreground">{t('adminOrg.selectUnitFirst')}</p>
          ) : !memberIds.length ? (
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>{t('adminOrg.deptOrgRolesNeedMembers')}</p>
              <Link
                to={`/app/admin/org-structure/departments/members?unitId=${encodeURIComponent(selectedId)}`}
                className={adminSecondaryBtnClass()}
              >
                {t('adminDomains.orgStructure.deptMembers')}
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              <label className="block text-sm">
                <span className="mb-1 block text-muted-foreground">{t('adminOrg.deptOrgRolesPickMember')}</span>
                <select
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                >
                  {memberIds.map((id) => {
                    const m = membersByIdAll.get(id);
                    const label = m ? memberDisplayName(m) : id;
                    return (
                      <option key={id} value={id}>
                        {label}
                        {headId === id ? ' (Head)' : ''}
                      </option>
                    );
                  })}
                </select>
              </label>

              <label className="flex items-start gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1 rounded border-border"
                  checked={makeHead}
                  onChange={(e) => setMakeHead(e.target.checked)}
                />
                <span>
                  <span className="font-medium">{t('adminOrg.deptOrgRolesMakeHead')}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {t('adminOrg.deptOrgRolesManagerMapsHead')}
                  </span>
                </span>
              </label>

              {loadingAssign ? (
                <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
              ) : catalog.length ? (
                <ul className="max-h-64 space-y-1 overflow-auto rounded-xl border border-border/70 p-2">
                  {catalog.map((role) => {
                    const checked = assignedKeys.includes(role.key);
                    return (
                      <li key={role.key}>
                        <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted/40">
                          <input
                            type="checkbox"
                            className="rounded border-border"
                            checked={checked}
                            onChange={() => toggleKey(role.key)}
                          />
                          <span>
                            <span className="font-medium">{role.label || role.key}</span>
                            <span className="ml-1 text-xs text-muted-foreground">({role.key})</span>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">{t('adminRbac.orgRoleCatalogEmpty')}</p>
              )}

              <button type="button" disabled={busy || !selectedUserId} className={adminPrimaryBtnClass()} onClick={save}>
                {busy ? t('common.saving') : t('common.save')}
              </button>
            </div>
          )}
        </AdminUserFormCard>
      </div>
    </AdminUserPanelShell>
  );
}
