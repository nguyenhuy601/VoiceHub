/* ========================================
   PROTECTEDROUTE.JSX - ROUTE PROTECTION
   Component bảo vệ routes cần đăng nhập
   - Nếu chưa đăng nhập (Guest) → redirect về trang chủ
   - Nếu đã đăng nhập → render component con
======================================== */

import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

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

  // Nếu đang loading (check auth) → hiển thị loading
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <div className="text-center">
          <div className="text-8xl mb-4 animate-bounce">🚀</div>
          <div className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-pink-600 bg-clip-text text-transparent">
            Đang kiểm tra...
          </div>
        </div>
      </div>
    );
  }

  // Nếu chưa đăng nhập → redirect về trang chủ
  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  // Đã đăng nhập → render component con
  return children;
};

export default ProtectedRoute;

