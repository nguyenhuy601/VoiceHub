import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';

import AdminUserPicker from '../../components/adminUsers/AdminUserPicker';
import {
  AdminUserFormCard,
  AdminUserPanelShell,
  adminInputClass,
  adminPrimaryBtnClass,
  adminSecondaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { orgRoleCatalogAPI } from '../../services/api/orgRoleCatalogAPI';

function unique(arr) {
  return [...new Set((arr || []).map((x) => String(x).trim()).filter(Boolean))];
}

export default function OrgRoleAssignPanel({ orgId, embedded = false }) {
  const { t } = useAppStrings();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const userIdParam = useMemo(() => String(searchParams.get('userId') || '').trim(), [searchParams]);
  const roleIdParam = useMemo(() => String(searchParams.get('roleId') || '').trim(), [searchParams]);
  const roleKeyParam = useMemo(() => String(searchParams.get('roleKey') || '').trim(), [searchParams]);

  const [loading, setLoading] = useState(false);
  const [catalogError, setCatalogError] = useState('');
  const [roles, setRoles] = useState([]);
  const [selectedRoleKey, setSelectedRoleKey] = useState(roleKeyParam || '');
  const [assignBusy, setAssignBusy] = useState(false);
  const [loadingAssign, setLoadingAssign] = useState(false);
  const [assignError, setAssignError] = useState('');
  const [assignedRoleKeys, setAssignedRoleKeys] = useState([]);
  const assignLoadGenRef = useRef(0);

  const nonSystemRoles = useMemo(() => roles.filter((r) => !r.isSystem), [roles]);

  const loadCatalog = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setCatalogError('');
    try {
      const res = await orgRoleCatalogAPI.listCatalog(orgId);
      const list = res?.data?.roles || [];
      setRoles(list);

      setSelectedRoleKey((current) => {
        if (current) return current;
        if (!roleIdParam) return current;
        const found = list.find((r) => String(r._id || r.id) === roleIdParam);
        return found?.key || current;
      });
    } catch (error) {
      const msg = resolveApiErrorMessage(error, { t, fallback: t('common.loadFail') });
      toast.error(msg);
      setCatalogError(msg);
      setRoles([]);
    } finally {
      setLoading(false);
    }
  }, [orgId, roleIdParam, t]);

  const loadAssignmentsForUser = useCallback(
    async (uid) => {
      const id = String(uid || '').trim();
      const reqGen = assignLoadGenRef.current + 1;
      assignLoadGenRef.current = reqGen;
      if (!orgId || !id) {
        if (reqGen === assignLoadGenRef.current) {
          setAssignedRoleKeys([]);
          setAssignError('');
          setLoadingAssign(false);
        }
        return;
      }
      setLoadingAssign(true);
      setAssignError('');
      try {
        const res = await orgRoleCatalogAPI.listAssignments(orgId, { userId: id });
        const items = res?.data?.assignments || [];
        if (reqGen !== assignLoadGenRef.current) return;
        setAssignedRoleKeys(unique(items.map((x) => x.roleKey)));
      } catch (error) {
        if (reqGen !== assignLoadGenRef.current) return;
        const msg = resolveApiErrorMessage(error, { t, fallback: t('common.loadFail') });
        toast.error(msg);
        setAssignError(msg);
        setAssignedRoleKeys([]);
      } finally {
        if (reqGen === assignLoadGenRef.current) setLoadingAssign(false);
      }
    },
    [orgId, t]
  );

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    loadAssignmentsForUser(userIdParam);
  }, [userIdParam, loadAssignmentsForUser]);

  const setUserAssignments = async (nextRoleKeys) => {
    if (!orgId) return;
    if (!userIdParam) return;
    setAssignBusy(true);
    try {
      await orgRoleCatalogAPI.setAssignments(orgId, userIdParam, nextRoleKeys);
      toast.success(t('common.saveSuccess'));
      await loadAssignmentsForUser(userIdParam);
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('common.saveFail') }));
    } finally {
      setAssignBusy(false);
    }
  };

  const addRole = () => {
    if (!selectedRoleKey || !userIdParam) return;
    const next = unique([...assignedRoleKeys, selectedRoleKey]);
    setUserAssignments(next);
  };

  const removeRole = () => {
    if (!selectedRoleKey || !userIdParam) return;
    const next = assignedRoleKeys.filter((k) => String(k) !== String(selectedRoleKey));
    setUserAssignments(next);
  };

  const body = (
    <AdminUserFormCard title={t('adminDomains.rbac.orgRoleAssign')}>
      {loading ? (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : catalogError ? (
        <div className="space-y-3">
          <p className="rounded-xl border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {catalogError}
          </p>
          <button type="button" className={adminPrimaryBtnClass()} disabled={assignBusy} onClick={() => loadCatalog()}>
            {t('adminRbac.retry')}
          </button>
        </div>
      ) : !nonSystemRoles.length ? (
        <p className="text-sm text-muted-foreground">{t('adminRbac.orgRoleCatalogEmpty')}</p>
      ) : (
        <>
          <label className="mb-3 block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">{t('adminRbac.roleLabelField')}</span>
            <select
              className={adminInputClass()}
              value={selectedRoleKey}
              onChange={(e) => setSelectedRoleKey(e.target.value)}
            >
              <option value="">-- {t('adminRbac.selectRole')} --</option>
              {nonSystemRoles.map((r) => (
                <option key={r._id || r.id} value={r.key}>
                  {r.label || r.key}
                </option>
              ))}
            </select>
          </label>

          <div className="mb-3 rounded-lg border border-border bg-muted/40 p-3 text-sm">
            <div className="font-medium text-foreground">{t('adminRbac.orgRoleCurrentRoles')}</div>
            <div className="mt-1 text-muted-foreground">
              {!userIdParam ? (
                t('adminUsers.selectUserFirst')
              ) : loadingAssign ? (
                t('common.loading')
              ) : assignError ? (
                <div className="space-y-2">
                  <p className="text-destructive">{assignError}</p>
                  <button
                    type="button"
                    className={adminPrimaryBtnClass()}
                    disabled={assignBusy}
                    onClick={() => loadAssignmentsForUser(userIdParam)}
                  >
                    {t('adminRbac.retry')}
                  </button>
                </div>
              ) : assignedRoleKeys.length ? (
                assignedRoleKeys.join(', ')
              ) : (
                t('adminUsers.taxonomyNone')
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!userIdParam || !selectedRoleKey || assignBusy || Boolean(assignError)}
              className={adminPrimaryBtnClass()}
              onClick={addRole}
            >
              {assignBusy ? t('common.saving') : t('adminDomains.rbac.orgRoleAssign')}
            </button>
            <button
              type="button"
              disabled={!userIdParam || !selectedRoleKey || assignBusy || Boolean(assignError)}
              className={adminSecondaryBtnClass()}
              onClick={removeRole}
            >
              {t('adminDomains.rbac.orgRoleDelete') || 'Remove'}
            </button>
          </div>

          <div className="mt-4">
            <button type="button" className={adminSecondaryBtnClass()} disabled={assignBusy} onClick={() => navigate('/app/admin/rbac/org-roles/directory')}>
              {t('adminDomains.rbac.orgRoleDirectory')}
            </button>
          </div>
        </>
      )}
    </AdminUserFormCard>
  );

  if (embedded) return body;

  return (
    <AdminUserPanelShell
      title={t('adminDomains.rbac.orgRoleAssign')}
      hint={t('adminRbac.orgRoleAssignHint')}
      wide
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        <AdminUserPicker orgId={orgId} selectedUserId={userIdParam} hint={t('adminRbac.orgRoleAssignPickerHint')} />
        {body}
      </div>
    </AdminUserPanelShell>
  );
}

