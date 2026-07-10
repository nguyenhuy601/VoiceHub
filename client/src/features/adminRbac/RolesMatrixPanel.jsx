import { useMemo } from 'react';
import { useAppStrings } from '../../locales/appStrings';
import { useLocale } from '../../context/LocaleContext';
import useAdminRoles from '../../hooks/useAdminRoles';
import { flattenPermissionSlots } from '../../config/adminRbacCatalog';
import {
  grantedPermissionCount,
  normalizeRoleDisplayName,
  normalizeRoleId,
} from '../../utils/adminRbacUtils';

function hasPermission(role, resource, action) {
  const entries = role?.permissions || [];
  const row = entries.find((p) => String(p.resource) === resource);
  if (!row) return false;
  return (row.actions || []).includes(action);
}

export default function RolesMatrixPanel({ orgId }) {
  const { t } = useAppStrings();
  const { locale } = useLocale();
  const { systemRoles, loading } = useAdminRoles(orgId);

  const slots = useMemo(() => flattenPermissionSlots(), []);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{t('adminDomains.rbac.matrix')}</h2>
        <p className="text-sm text-muted-foreground">{t('adminRbac.matrixHint')}</p>
      </div>
      {loading ? (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : !systemRoles.length ? (
        <p className="text-sm text-muted-foreground">{t('adminRbac.noRoles')}</p>
      ) : (
        <div className="overflow-auto rounded-xl border border-border">
          <table className="min-w-full text-xs">
            <thead className="bg-muted/60 text-left uppercase text-muted-foreground">
              <tr>
                <th className="sticky left-0 z-10 bg-muted/80 px-3 py-2">{t('adminRbac.colPermission')}</th>
                {systemRoles.map((role) => (
                  <th key={normalizeRoleId(role)} className="min-w-[88px] px-2 py-2 text-center">
                    <div className="truncate font-medium normal-case">{normalizeRoleDisplayName(role.name)}</div>
                    <div className="text-[10px] font-normal text-muted-foreground">
                      {grantedPermissionCount(role.permissions)}
                      {role.scope ? ` · ${role.scope}` : ''}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slots.map((slot) => (
                <tr key={slot.key} className="border-t border-border/60">
                  <td className="sticky left-0 z-10 bg-background/95 px-3 py-1.5">
                    <span className="text-muted-foreground">
                      {locale === 'en' ? slot.groupLabel : slot.groupLabelVi}
                    </span>
                    <span className="mx-1">·</span>
                    <span title={slot.description}>
                      {locale === 'en' ? slot.label : slot.description}
                    </span>
                  </td>
                  {systemRoles.map((role) => {
                    const on = hasPermission(role, slot.resource, slot.action);
                    return (
                      <td key={`${normalizeRoleId(role)}-${slot.key}`} className="px-2 py-1.5 text-center">
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
