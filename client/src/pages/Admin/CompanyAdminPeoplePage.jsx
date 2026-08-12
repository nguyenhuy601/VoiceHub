import PeoplePanel from '../../features/companyAdmin/PeoplePanel';
import { useCompanyAdminContext } from './CompanyAdminLayout';

export default function CompanyAdminPeoplePage() {
  const { orgId } = useCompanyAdminContext();
  return <PeoplePanel orgId={orgId} />;
}
