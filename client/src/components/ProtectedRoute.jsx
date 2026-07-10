/* ========================================
   PROTECTEDROUTE.JSX - ROUTE PROTECTION
   Component bảo vệ routes cần đăng nhập
   - Nếu chưa đăng nhập (Guest) → redirect về trang chủ
   - Nếu đã đăng nhập → render component con
======================================== */

import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import BrandPageLoader from './Shared/BrandPageLoader';
import { useAppStrings } from '../locales/appStrings';

/**
 * ProtectedRoute Component
 * Bảo vệ routes cần đăng nhập
 * 
 * Props:
 * - children: Component cần render nếu đã đăng nhập
 * 
 * Behavior:
 * - Nếu isAuthenticated = false → redirect về "/"
 * - Nếu isAuthenticated = true → render children
 */
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  const { t } = useAppStrings();

  // Nếu đang loading (check auth) → hiển thị loading
  if (loading) {
    return (
      <BrandPageLoader
        message={t('auth.checkingSession')}
        subMessage={t('auth.verifyingSession')}
      />
    );
  }

  // Nếu chưa đăng nhập → redirect về trang chủ
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Đã đăng nhập → render component con
  return children;
};

export default ProtectedRoute;

