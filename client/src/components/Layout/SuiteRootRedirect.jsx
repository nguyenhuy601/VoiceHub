import { Navigate } from 'react-router-dom';
import useCompanyAdminAccess from '../../hooks/useCompanyAdminAccess';
import { getDefaultPathForSuite, readStoredSuite, SUITE, writeStoredSuite } from '../../utils/suitePathUtils';

/**
 * `/app` → suite mặc định.
 * System admin luôn vào shell Admin (tách khỏi UI nhân viên).
 */
const SuiteRootRedirect = () => {
  const { isSystemAdmin, canAccessHub } = useCompanyAdminAccess();
  const storedSuite = readStoredSuite();

  if (isSystemAdmin) {
    if (storedSuite !== SUITE.ADMIN) writeStoredSuite(SUITE.ADMIN);
    return <Navigate to={getDefaultPathForSuite(SUITE.ADMIN)} replace />;
  }

  // Owner/admin/hr công ty: lần đầu từ communicate → admin; giữ suite đã chọn khác.
  const targetSuite =
    canAccessHub && storedSuite === SUITE.COMMUNICATE ? SUITE.ADMIN : storedSuite;
  if (targetSuite !== storedSuite) writeStoredSuite(targetSuite);

  return <Navigate to={getDefaultPathForSuite(targetSuite)} replace />;
};

export default SuiteRootRedirect;
