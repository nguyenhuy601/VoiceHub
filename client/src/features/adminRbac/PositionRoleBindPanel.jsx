import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';

import {
  AdminUserFormCard,
  AdminUserPanelShell,
  adminPrimaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import { AdminBusySpinner, AdminLoadErrorState } from '../../components/adminUsers/adminPanelStates';
import { useAppStrings } from '../../locales/appStrings';
import { organizationAPI } from '../../services/api/organizationAPI';
import { orgRoleCatalogAPI } from '../../services/api/orgRoleCatalogAPI';
import { orgRbacAPI } from '../../services/api/orgRbacAPI';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import {
  isRedundantPositionAliasRow,
  localizedPositionLabel,
} from '../../utils/positionLocale';
import { canonicalizeOrgRoleLabel } from '../../utils/effectiveOrgRoleLabel';
import { filterOrgRoleCatalogRows } from '../../utils/orgRoleLocale';

/**
 * Step 3 — Gán Org Role vào Position (Position không cầm grant trực tiếp).
 */
export default function PositionRoleBindPanel({ orgId }) {
  const { t } = useAppStrings();
  const [searchParams, setSearchParams] = useSearchParams();
  const [positions, setPositions] = useState([]);
  const [roles, setRoles] = useState([]);
  const [positionId, setPositionId] = useState(() => String(searchParams.get('positionId') || ''));
  const [selectedRoleIds, setSelectedRoleIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!orgId) return;
    const [posRes, roleRes] = await Promise.all([
      organizationAPI.listHrPositions(orgId),
      orgRoleCatalogAPI.listCatalog(orgId),
    ]);
    const posList = posRes?.data?.positions || posRes?.data?.data?.positions || [];
    const roleList = roleRes?.data?.roles || roleRes?.data?.data?.roles || [];
    setPositions(Array.isArray(posList) ? posList : []);
    setRoles(Array.isArray(roleList) ? roleList : []);
  }, [orgId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        await load();
      } catch (err) {
        if (!cancelled) {
          const msg = resolveApiErrorMessage(err, { t, fallback: t('common.loadFail') });
          setError(msg);
          toast.error(msg);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load, t]);

  useEffect(() => {
    if (!orgId || !positionId) {
      setSelectedRoleIds([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await orgRbacAPI.getPositionRoles(orgId, positionId);
        const bindings = res?.data?.bindings || res?.data?.data?.bindings || [];
        if (!cancelled) {
          setSelectedRoleIds(bindings.map((b) => String(b.roleId)).filter(Boolean));
        }
      } catch (err) {
        if (!cancelled) {
          toast.error(resolveApiErrorMessage(err, { t, fallback: t('common.loadFail') }));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId, positionId, t]);

  const choosePosition = (nextId) => {
    setPositionId(nextId);
    const params = new URLSearchParams(searchParams);
    if (nextId) params.set('positionId', nextId);
    else params.delete('positionId');
    setSearchParams(params, { replace: true });
  };

  const positionOptions = useMemo(() => {
    const mapped = positions.map((p) => {
      const key = String(p.key || p.code || '').trim();
      return {
        id: String(p._id || p.id),
        key,
        label: localizedPositionLabel(key, p.title || p.name || key, t),
      };
    });
    return mapped.filter((p) => !isRedundantPositionAliasRow(p, mapped));
  }, [positions, t]);

  const roleOptions = useMemo(
    () =>
      filterOrgRoleCatalogRows(roles).map((r) => ({
        id: String(r._id || r.id),
        label: canonicalizeOrgRoleLabel(r.key || r.code, r.label || r.name || r.key || r.code, t),
      })),
    [roles, t]
  );

  const toggleRole = (id) => {
    setSelectedRoleIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const save = async () => {
    if (!orgId || !positionId || saving) return;
    setSaving(true);
    try {
      await orgRbacAPI.putPositionRoles(orgId, positionId, selectedRoleIds);
      toast.success(t('adminDomains.rbac.positionRolesSaved'));
    } catch (err) {
      toast.error(resolveApiErrorMessage(err, { t, fallback: t('common.saveFail') }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminUserPanelShell
      title={t('adminDomains.rbac.positionRoleBind')}
      hint={t('adminDomains.rbac.positionRoleBindHint')}
    >
      {loading ? <AdminBusySpinner /> : null}
      {!loading && error ? <AdminLoadErrorState message={error} /> : null}
      {!loading && !error ? (
        <AdminUserFormCard title={t('adminDomains.rbac.sectionPositions')}>
          <label className="flex flex-col gap-1 text-sm">
            <span>{t('adminDomains.rbac.selectPosition')}</span>
            <select
              className="max-w-md rounded-md border border-border bg-background px-2 py-1.5"
              value={positionId}
              onChange={(e) => choosePosition(e.target.value)}
            >
              <option value="">—</option>
              {positionOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          {positionId ? (
            <>
              <ul className="mt-4 space-y-2 text-sm">
                {roleOptions.map((r) => (
                  <li key={r.id}>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedRoleIds.includes(r.id)}
                        onChange={() => toggleRole(r.id)}
                      />
                      {r.label}
                    </label>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className={`${adminPrimaryBtnClass()} mt-4`}
                disabled={saving}
                onClick={save}
              >
                {saving ? t('common.saving') : t('common.save')}
              </button>
            </>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              {t('adminDomains.rbac.selectPositionFirst')}
            </p>
          )}
        </AdminUserFormCard>
      ) : null}
    </AdminUserPanelShell>
  );
}
