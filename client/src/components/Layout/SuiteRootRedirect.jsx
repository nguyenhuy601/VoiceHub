import { Navigate } from 'react-router-dom';
import { getDefaultPathForSuite, readStoredSuite } from '../../utils/suitePathUtils';

const SuiteRootRedirect = () => <Navigate to={getDefaultPathForSuite(readStoredSuite())} replace />;

export default SuiteRootRedirect;
