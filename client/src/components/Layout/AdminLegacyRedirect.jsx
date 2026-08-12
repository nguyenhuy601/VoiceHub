import { Navigate, useSearchParams } from 'react-router-dom';
import { mapLegacyAdminTabToPath } from '../../utils/suitePathUtils';

/** Chuyển /app/collaborate/admin?tab=… sang /app/admin/… */
export default function AdminLegacyRedirect() {
  const [searchParams] = useSearchParams();
  const tab = searchParams.get('tab');
  return <Navigate to={mapLegacyAdminTabToPath(tab)} replace />;
}
