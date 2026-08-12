import { useNavigate } from 'react-router-dom';
import { LEGACY_ADMIN_TAB_TO_PATH } from '../../config/adminNavConfig';
import OverviewPanel from '../../features/companyAdmin/OverviewPanel';
import { useCompanyAdminContext } from './CompanyAdminLayout';

export default function CompanyAdminOverviewPage() {
  const navigate = useNavigate();
  const { memberCount } = useCompanyAdminContext();

  const selectTab = (tabId) => {
    const path = LEGACY_ADMIN_TAB_TO_PATH[tabId] || LEGACY_ADMIN_TAB_TO_PATH.overview;
    navigate(path);
  };

  return <OverviewPanel memberCount={memberCount} onSelectTab={selectTab} />;
}
