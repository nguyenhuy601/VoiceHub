import { Link } from 'react-router-dom';
import {
  AdminUserFormCard,
  AdminUserPanelShell,
  adminSecondaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import { useAppStrings } from '../../locales/appStrings';
import {
  DEFAULT_PROJECT_ROLE_CAN_ASSIGN,
  DEFAULT_PROJECT_ROLE_KEYS,
  PROJECT_ROLE_LABELS,
  ROLE_KIND,
} from '../../utils/roleTaxonomy';

export default function RbacProjectRoleCatalogPanel() {
  const { t } = useAppStrings();
  const keys = Object.values(DEFAULT_PROJECT_ROLE_KEYS);

  return (
    <AdminUserPanelShell
      title={t('adminDomains.rbac.projectRoleCatalog')}
      hint={t('adminRbac.projectRoleCatalogHint')}
    >
      <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
        {t('adminRbac.projectRoleCatalogCanAssign')}
      </p>
      <AdminUserFormCard title={t('adminDomains.rbac.projectRoleCatalog')}>
        <ul className="divide-y divide-border">
          {keys.map((key) => (
            <li key={key} className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-sm">
              <span className="font-medium">{PROJECT_ROLE_LABELS[key] || key}</span>
              <span className="text-xs text-muted-foreground">
                {key} · {ROLE_KIND.PROJECT}
                {DEFAULT_PROJECT_ROLE_CAN_ASSIGN[key] ? (
                  <span className="ml-2 text-emerald-600">{t('adminTasks.canAssign')}</span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link to="/app/admin/rbac/project-roles/board" className={adminSecondaryBtnClass()}>
            {t('adminRbac.projectRoleCatalogBoardCta')}
          </Link>
          <Link to="/app/admin/tasks/project-team" className={adminSecondaryBtnClass()}>
            {t('adminRbac.projectRoleCatalogCta')}
          </Link>
        </div>
      </AdminUserFormCard>
    </AdminUserPanelShell>
  );
}
