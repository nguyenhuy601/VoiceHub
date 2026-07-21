import { Link } from 'react-router-dom';
import {
  AdminUserFormCard,
  AdminUserPanelShell,
  adminSecondaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import { useAppStrings } from '../../locales/appStrings';
import {
  ORGANIZATION_ROLE_KEYS,
  ORGANIZATION_ROLE_LABELS,
  ROLE_KIND,
} from '../../utils/roleTaxonomy';

const ORG_ROLE_ROWS = [
  ORGANIZATION_ROLE_KEYS.DEPARTMENT_MANAGER,
  ORGANIZATION_ROLE_KEYS.TEAM_MANAGER,
  ORGANIZATION_ROLE_KEYS.DIRECTOR,
];

export default function RbacOrgRoleCatalogPanel() {
  const { t } = useAppStrings();

  return (
    <AdminUserPanelShell
      title={t('adminDomains.rbac.orgRoleCatalog')}
      hint={t('adminRbac.orgRoleCatalogHint')}
    >
      <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
        {t('adminRbac.orgRoleCatalogResolve')}
      </p>
      <AdminUserFormCard title={t('adminDomains.rbac.orgRoleCatalog')}>
        <ul className="divide-y divide-border">
          {ORG_ROLE_ROWS.map((key) => (
            <li key={key} className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-sm">
              <span className="font-medium">{ORGANIZATION_ROLE_LABELS[key] || key}</span>
              <span className="text-xs text-muted-foreground">
                {key} · {ROLE_KIND.ORGANIZATION}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link to="/app/admin/rbac/organization-roles/directory" className={adminSecondaryBtnClass()}>
            {t('adminRbac.orgRoleCatalogDirectoryCta')}
          </Link>
          <Link to="/app/admin/org-structure" className={adminSecondaryBtnClass()}>
            {t('adminRbac.orgRoleCatalogCta')}
          </Link>
        </div>
      </AdminUserFormCard>
    </AdminUserPanelShell>
  );
}
