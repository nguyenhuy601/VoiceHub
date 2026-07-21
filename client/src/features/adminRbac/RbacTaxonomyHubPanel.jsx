import { Link } from 'react-router-dom';

import { useAppStrings } from '../../locales/appStrings';

import {

  AdminUserFormCard,

  AdminUserPanelShell,

  adminSecondaryBtnClass,

} from '../../components/adminUsers/adminUserPanelUi';



const LAYER_CARDS = [

  {

    titleKey: 'taxonomyCardPositionTitle',

    bodyKey: 'taxonomyCardPositionBody',

    to: '/app/admin/rbac/positions',

    ctaKey: 'listLinkPosition',

  },

  {

    titleKey: 'taxonomyCardOrgRoleTitle',

    bodyKey: 'taxonomyCardOrgRoleBody',

    to: '/app/admin/rbac/org-roles',

    ctaKey: 'taxonomyLinkOrgRoles',

  },

  {

    titleKey: 'taxonomyCardProjectRoleTitle',

    bodyKey: 'taxonomyCardProjectRoleBody',

    to: '/app/admin/rbac/project-roles',

    ctaKey: 'taxonomyLinkProjectRoles',

  },

  {

    titleKey: 'taxonomyCardSystemRoleTitle',

    bodyKey: 'taxonomyCardSystemRoleBody',

    to: '/app/admin/rbac/roles',

    ctaKey: 'taxonomyLinkRoles',

  },

];



export default function RbacTaxonomyHubPanel() {

  const { t } = useAppStrings();



  return (

    <AdminUserPanelShell title={t('adminDomains.rbac.taxonomy')} hint={t('adminRbac.taxonomyHint')}>

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

      <AdminUserFormCard title={t('adminRbac.taxonomyLayerResponsibility')}>

        <div className="flex flex-wrap gap-2">

          <Link to="/app/admin/rbac/responsibilities" className={adminSecondaryBtnClass()}>

            {t('adminRbac.taxonomyLinkResponsibility')}

          </Link>

          <Link to="/app/admin/rbac/org-roles/directory" className={adminSecondaryBtnClass()}>

            {t('adminRbac.taxonomyLinkOrgDirectory')}

          </Link>

          <Link to="/app/admin/rbac/project-roles/board" className={adminSecondaryBtnClass()}>

            {t('adminRbac.taxonomyLinkProjectBoard')}

          </Link>

        </div>

      </AdminUserFormCard>

    </AdminUserPanelShell>

  );

}

