import { Navigate, useLocation } from 'react-router-dom';
import { mapCollaboratePathToDualSuite } from '../../utils/suitePathUtils';

/** Redirect legacy /app/collaborate/* → /app/company/* hoặc /app/projects/*. */
export default function CollaborateLegacyRedirect() {
  const location = useLocation();
  const to = mapCollaboratePathToDualSuite(location.pathname, location.search);
  return <Navigate to={to} replace />;
}
