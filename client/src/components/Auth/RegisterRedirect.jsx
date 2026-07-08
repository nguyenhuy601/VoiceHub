import { Navigate } from 'react-router-dom';
import { readSingleOrgModeFlag } from '../../utils/singleCompanyMode';
import RegisterPage from '../../pages/Auth/RegisterPage';

/** Single-company: chuyển /register → /login */
export default function RegisterRedirect() {
  if (readSingleOrgModeFlag()) {
    return <Navigate to="/login" replace />;
  }
  return <RegisterPage />;
}
