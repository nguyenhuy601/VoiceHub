import { Link } from 'react-router-dom';
import { useAppStrings } from '../../locales/appStrings';
import {
  AdminUserFormCard,
  AdminUserPanelShell,
  adminSecondaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';

const LAYER_CARDS = [
  {
    titleKey: 'taxonomyCardPermissionTitle',
    bodyKey: 'taxonomyCardPermissionBody',
    to: '/app/admin/rbac/permissions-by-domain',
    ctaKey: 'taxonomyLinkPermissions',
  },
  {
    titleKey: 'taxonomyCardOrgRoleTitle',
    bodyKey: 'taxonomyCardOrgRoleBody',
    to: '/app/admin/rbac/org-roles/permissions',
    ctaKey: 'taxonomyLinkOrgRoleMatrix',
  },
  {
    titleKey: 'taxonomyCardPositionTitle',
    bodyKey: 'taxonomyCardPositionBody',
    to: '/app/admin/rbac/positions/roles',
    ctaKey: 'taxonomyLinkPositionRoles',
  },
  {
    titleKey: 'taxonomyCardProjectRoleTitle',
    bodyKey: 'taxonomyCardProjectRoleBody',
    to: '/app/admin/rbac/project-roles',
    ctaKey: 'taxonomyLinkProjectRoles',
  },
];

export default function RbacTaxonomyHubPanel() {
  const { t } = useAppStrings();

  return (
    <AdminUserPanelShell title={t('adminDomains.rbac.taxonomy')}>
      <div className="grid gap-3 sm:grid-cols-2">
        {LAYER_CARDS.map((card) => (
          <AdminUserFormCard key={card.titleKey} title={t(`adminRbac.${card.titleKey}`)}>
            <p className="text-sm text-muted-foreground">{t(`adminRbac.${card.bodyKey}`)}</p>
            <div className="mt-3">
              <Link to={card.to} className={adminSecondaryBtnClass()}>
                {t(`adminRbac.${card.ctaKey}`)}
              </Link>
            </div>
          </AdminUserFormCard>
        ))}
      </div>
      <AdminUserFormCard title={t('adminDomains.rbac.posAssignQuickLinksTitle')}>
        <div className="flex flex-wrap gap-2">
          <Link to="/app/admin/rbac/org-roles" className={adminSecondaryBtnClass()}>
            {t('adminRbac.taxonomyLinkOrgRoles')}
          </Link>
          <Link to="/app/admin/rbac/positions" className={adminSecondaryBtnClass()}>
            {t('adminRbac.listLinkPosition')}
          </Link>
          <Link to="/app/admin/rbac/positions/assign" className={adminSecondaryBtnClass()}>
            {t('adminDomains.rbac.posAssign')}
          </Link>
        </div>
      </AdminUserFormCard>
    </AdminUserPanelShell>
  );
}
