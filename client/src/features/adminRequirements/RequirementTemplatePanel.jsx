import { useState } from 'react';

import { AdminUserPanelShell } from '../../components/adminUsers/adminUserPanelUi';

import BrandPageLoader from '../../components/Shared/BrandPageLoader';

import { useAppStrings } from '../../locales/appStrings';

import useRequirementAccess from '../../hooks/useRequirementAccess';

import RequirementImportWorkspace from '../requirements/RequirementImportWorkspace';

import RequirementAccessPolicyPanel from './RequirementAccessPolicyPanel';



export default function RequirementTemplatePanel({ orgId, embedded = false }) {

  const { t } = useAppStrings();

  const { access, loading, loaded } = useRequirementAccess(orgId);

  const [headerActions, setHeaderActions] = useState(null);

  const [activeTab, setActiveTab] = useState('import');



  const tabBtn = (key, label) => (

    <button

      type="button"

      onClick={() => setActiveTab(key)}

      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${

        activeTab === key

          ? 'bg-primary text-primary-foreground shadow-sm'

          : 'border border-border bg-background text-muted-foreground hover:bg-muted/40'

      }`}

    >

      {label}

    </button>

  );



  const body =

    !orgId || !loaded || loading ? (

      <div className="flex justify-center py-10">

        <BrandPageLoader />

      </div>

    ) : (

      <>

        <div className="mb-4 flex flex-wrap gap-2">

          {tabBtn('import', t('adminDomains.requirements.tabImport'))}

          {tabBtn('access', t('adminDomains.requirements.tabAccessPolicy'))}

        </div>

        {activeTab === 'import' ? (

          <RequirementImportWorkspace

            orgId={orgId}

            variant="admin"

            canSubmit={access.canSubmit}

            canApprove={access.canApprove}

            canCreateFromPack={access.canCreateFromPack}

            canRunAiPlanning={access.canRunAiPlanning}

            setHeaderActions={setHeaderActions}

          />

        ) : (

          <RequirementAccessPolicyPanel orgId={orgId} />

        )}

      </>

    );



  if (embedded) return body;



  return (

    <AdminUserPanelShell

      title={t('adminDomains.requirements.title')}

      hint={t('adminDomains.requirements.subtitle')}

      actions={activeTab === 'import' ? headerActions : null}

    >

      {body}

    </AdminUserPanelShell>

  );

}

