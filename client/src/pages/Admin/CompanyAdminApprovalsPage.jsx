import JoinApprovalsPanel from '../../features/companyAdmin/JoinApprovalsPanel';
import { useCompanyAdminContext } from './CompanyAdminLayout';

export default function CompanyAdminApprovalsPage() {
  const { orgId } = useCompanyAdminContext();
  return <JoinApprovalsPanel orgId={orgId} />;
}
