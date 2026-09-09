import { useMemo } from 'react';
import { useAppStrings } from '../../locales/appStrings';
import { adminPrimaryBtnClass } from '../../components/adminUsers/adminUserPanelUi';
import useAdminRoles from '../../hooks/useAdminRoles';
import useRoleMasterGrantsMap from '../../hooks/useRoleMasterGrantsMap';
import { countMasterGrants } from '../../utils/rbacV2Ui';
import { normalizeRoleDisplayName, normalizeRoleId } from '../../utils/adminRbacUtils';

export default function RolesMatrixPanel({ orgId }) {
  const { t } = useAppStrings();
  const { systemRoles, loading, error, loadRoles } = useAdminRoles(orgId);
  const {
    slots,
    grantsByRoleId,
    loading: grantsLoading,
    error: catalogError,
    reload,
  } = useRoleMasterGrantsMap(orgId, systemRoles);

  const busy = loading || grantsLoading;
  const grantSetByRole = useMemo(() => {
    const map = {};
    for (const [id, grants] of Object.entries(grantsByRoleId || {})) {
      map[id] = new Set(grants);
    }
    return map;
  }, [grantsByRoleId]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{t('adminDomains.rbac.matrix')}</h2>
        <p className="text-sm text-muted-foreground">{t('adminRbac.matrixHint')}</p>
      </div>
      {busy ? (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : error || catalogError ? (
        <div className="space-y-3">
          <p className="rounded-xl border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error || catalogError}
          </p>
          <button
            type="button"
            className={adminPrimaryBtnClass()}
            onClick={() => {
              loadRoles();
              reload();
            }}
          >
            {t('adminRbac.retry')}
          </button>
        </div>
      ) : !systemRoles.length ? (
        <p className="text-sm text-muted-foreground">{t('adminRbac.noRoles')}</p>
      ) : !slots.length ? (
        <p className="rounded-xl border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {t('adminRbac.createHint')}
        </p>
      ) : (
        <div className="overflow-auto rounded-xl border border-border">
          <table className="min-w-full text-xs">
            <thead className="bg-muted/60 text-left uppercase text-muted-foreground">
              <tr>
                <th className="sticky left-0 z-10 bg-muted/80 px-3 py-2">{t('adminRbac.colPermission')}</th>
                {systemRoles.map((role) => {
                  const id = normalizeRoleId(role);
                  return (
                    <th key={id} className="min-w-[88px] px-2 py-2 text-center">
                      <div className="truncate font-medium normal-case">{normalizeRoleDisplayName(role.name)}</div>
                      <div className="text-[10px] font-normal text-muted-foreground">
                        {countMasterGrants(grantsByRoleId[id])}
                        {role.scope ? ` · ${role.scope}` : ''}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {slots.map((slot) => (
                <tr key={slot.key} className="border-t border-border/60">
                  <td className="sticky left-0 z-10 bg-background/95 px-3 py-1.5">
                    <span className="text-muted-foreground">{slot.categoryLabel}</span>
                    <span className="mx-1">·</span>
                    <span title={slot.key}>
                      {slot.moduleLabel} · {slot.action}
                    </span>
                  </td>
                  {systemRoles.map((role) => {
                    const id = normalizeRoleId(role);
                    const on = grantSetByRole[id]?.has(slot.key);
                    return (
                      <td key={`${id}-${slot.key}`} className="px-2 py-1.5 text-center">
                        <span
                          className={`inline-block h-2.5 w-2.5 rounded-full ${on ? 'bg-emerald-500' : 'bg-muted'}`}
                          title={on ? t('adminRbac.granted') : t('adminRbac.denied')}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
