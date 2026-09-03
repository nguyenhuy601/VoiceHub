/**
 * Gán Org Role catalog cho members trong phòng.
 * Trưởng phòng (head) vẫn có thể đặt qua checkbox «Trưởng phòng» (setHead).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

export default function DeptOrgRolesPanel({ orgId, embedded = false }) {
  const { t } = useAppStrings();
  const [searchParams] = useSearchParams();
  const unitParam = String(searchParams.get('unitId') || '').trim();
  const { departments, loading, error: structureError, loadStructure } = useAdminOrgStructure(orgId, { includeInactive: embedded });
  const { membersByIdAll, error: membersError, loadMembers } = useAdminMembers(orgId);

  const [selectedId, setSelectedId] = useState(unitParam);
  const [catalog, setCatalog] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [assignedKeys, setAssignedKeys] = useState([]);
  const [makeHead, setMakeHead] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadingAssign, setLoadingAssign] = useState(false);
  const [catalogError, setCatalogError] = useState('');
  const [assignError, setAssignError] = useState('');
  const assignLoadGenRef = useRef(0);

  const selected = useMemo(
    () => departments.find((row) => unitId(row) === selectedId) || null,
    [departments, selectedId]
  );
  const memberIds = selected?.memberIds || [];
  const headId = selected ? departmentHeadId(selected) : '';

  const customRoles = useMemo(() => (catalog || []).filter((r) => !r.isSystem), [catalog]);

  const loadCatalog = useCallback(async () => {
    if (!orgId) return;
    try {
      const res = await orgRoleCatalogAPI.listCatalog(orgId);
      setCatalog(res?.data?.roles || res?.data?.data?.roles || []);
      setCatalogError('');
    } catch (error) {
      const msg = resolveApiErrorMessage(error, { t, fallback: t('common.loadFail') });
      toast.error(msg);
      setCatalogError(msg);
      setCatalog([]);
    }
  }, [orgId, t]);

  const loadAssignmentsForUser = useCallback(
    async (uid) => {
      const id = String(uid || '').trim();
      const reqGen = assignLoadGenRef.current + 1;
      assignLoadGenRef.current = reqGen;
      if (!orgId || !id) {
        if (reqGen === assignLoadGenRef.current) {
          setAssignedKeys([]);
          setAssignError('');
        }
        return;
      }
      setLoadingAssign(true);
      setAssignError('');
      try {
        const res = await orgRoleCatalogAPI.listAssignments(orgId, { userId: id });
        const items = res?.data?.assignments || res?.data?.data?.assignments || [];
        if (reqGen !== assignLoadGenRef.current) return;
        setAssignedKeys(unique(items.map((x) => x.roleKey).filter((k) => k !== 'department_manager')));
      } catch (error) {
        if (reqGen !== assignLoadGenRef.current) return;
        const msg = resolveApiErrorMessage(error, { t, fallback: t('common.loadFail') });
        toast.error(msg);
        setAssignError(msg);
        setAssignedKeys([]);
      } finally {
        if (reqGen === assignLoadGenRef.current) setLoadingAssign(false);
      }
    },
    [orgId, t]
  );

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
    loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    if (!orgId || !selectedUserId) {
      assignLoadGenRef.current += 1;
      setAssignedKeys([]);
      setAssignError('');
      setLoadingAssign(false);
      return;
    }
    (async () => {
      await loadAssignmentsForUser(selectedUserId);
    })();
  }, [orgId, selectedUserId, loadAssignmentsForUser]);

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

  const body = (
    <AdminUserFormCard title={unitName(selected) || t('adminDomains.orgStructure.deptOrgRoles')}>
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
      ) : catalogError ? (
        <div className="space-y-3">
          <p className="rounded-xl border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {catalogError}
          </p>
          <button type="button" className={adminPrimaryBtnClass()} onClick={() => loadCatalog()}>
            {t('adminRbac.retry')}
          </button>
        </div>
      ) : !selected ? (
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
          ) : assignError ? (
            <div className="space-y-3">
              <p className="rounded-xl border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {assignError}
              </p>
              <button
                type="button"
                className={adminPrimaryBtnClass()}
                onClick={() => loadAssignmentsForUser(selectedUserId)}
              >
                {t('adminRbac.retry')}
              </button>
            </div>
          ) : customRoles.length ? (
            <ul className="max-h-64 space-y-1 overflow-auto rounded-xl border border-border/70 p-2">
              {customRoles.map((role) => {
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
            <p className="text-xs text-muted-foreground">{t('adminOrg.deptOrgRolesNoCustom')}</p>
          )}

          <button type="button" disabled={busy || !selectedUserId} className={adminPrimaryBtnClass()} onClick={save}>
            {busy ? t('common.saving') : t('common.save')}
          </button>
        </div>
      )}
    </AdminUserFormCard>
  );

  if (embedded) return body;

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
          error={structureError}
          onRetry={() => loadStructure()}
          selectedId={selectedId}
          onSelect={setSelectedId}
          hint={t('adminOrg.deptOrgRolesPickerHint')}
          subtitleFn={(row) => `${(row.memberIds || []).length} members`}
        />
        {body}
      </div>
    </AdminUserPanelShell>
  );
}
