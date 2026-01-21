/* ========================================
   AUTHCONTEXT.JSX - AUTHENTICATION CONTEXT
   Quản lý toàn bộ authentication state của app
   - User login/logout/register
   - Lưu token vào localStorage
   - Provide user info cho toàn bộ app
   - Auto check auth khi reload page
======================================== */

// Import hooks từ React để build context
import { createContext, useCallback, useContext, useEffect, useState } from 'react';

// Import toast để hiển thị notifications
// Dùng để show "Đăng nhập thành công", "Đăng xuất", etc.
import toast from 'react-hot-toast';

// Import authService để call API authentication
// File: ../services/authService.js - chứa login(), register(), logout()
import authService from '../services/authService';

/* ========================================
   TẠO CONTEXT
   - createContext(null): tạo Context với giá trị mặc định null
   - Context này sẽ được provide ở AuthProvider
   - Các component con dùng useAuth() để access
======================================== */
const AuthContext = createContext(null);

/* ========================================
   CUSTOM HOOK: useAuth()
   Cách dùng: const { user, login, logout } = useAuth();
   
   Tại sao cần?
   - Thay vì dùng useContext(AuthContext) ở mỗi file
   - Chỉ cần import useAuth() - ngắn gọn hơn
   - Có error handling: báo lỗi nếu dùng ngoài Provider
======================================== */
export const useAuth = () => {
  // Lấy context value từ AuthContext
  const context = useContext(AuthContext);
  
  // Check xem component có được wrap trong AuthProvider không
  // Nếu không → context = null → throw error
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  
  // Return context để component có thể dùng
  // VD: { user, login, logout, isAuthenticated, ... }
  return context;
};

/* ========================================
   AUTHPROVIDER COMPONENT
   Wrap toàn bộ app (ở main.jsx)
   Cung cấp auth functions & state cho mọi component
   
   Props:
   - children: các component con (App, Toaster, etc.)
======================================== */
export const AuthProvider = ({ children }) => {
  /* ----- STATE MANAGEMENT ----- */
  
  // State lưu thông tin user hiện tại
  // Default: Demo user (để test UI không cần login)
  // Khi login thành công → setUser(userData từ API)
  const [user, setUser] = useState({
    id: '1',                        // User ID
    name: 'Demo User',              // Tên hiển thị
    email: 'demo@example.com',      // Email
    avatar: null                    // Avatar URL (null = dùng default)
  });
  
  // State loading: true khi đang check auth hoặc đang login
  // Dùng để hiển thị loading spinner
  const [loading, setLoading] = useState(false);

  /* ========================================
     useEffect: CHECK AUTH KHI APP KHỞI ĐỘNG
     Chạy 1 lần khi component mount
     - Kiểm tra có token trong localStorage không
     - Nếu có → gọi API lấy user info
     - Nếu không → user = null (chưa login)
  ======================================== */
  useEffect(() => {
    // Async function để check authentication
    const checkAuth = async () => {
      try {
        // Lấy token từ localStorage (được lưu khi login)
        const token = localStorage.getItem('token');
        
        // Nếu có token → nghĩa là user đã login trước đó
        if (token) {
          // Gọi API để lấy thông tin user hiện tại
          // authService.getCurrentUser() → GET /api/auth/me
          const userData = await authService.getCurrentUser();
          
          // Set user data vào state
          setUser(userData);
        }
      } catch (error) {
        // Nếu có lỗi (token hết hạn, invalid, etc.)
        console.error('Auth check failed:', error);
        
        // Xóa token lỗi khỏi localStorage
        localStorage.removeItem('token');
      } finally {
        // Dù thành công hay thất bại cũng set loading = false
        setLoading(false);
      }
    };

    // Hiện tại skip auth check để demo
    // Comment lại để test UI không cần backend
    setLoading(false);
    // checkAuth(); // Uncomment khi có backend
  }, []); // Empty deps → chỉ chạy 1 lần khi mount

  /* ========================================
     LOGIN FUNCTION
     Đăng nhập user với email & password
     
     Luồng:
     1. Gọi authService.login() → POST /api/auth/login
     2. Nhận token + user data từ API
     3. Lưu token vào localStorage
     4. Set user vào state
     5. Show toast success
     
     Return: true (thành công) / false (thất bại)
  ======================================== */
  const login = useCallback(async (email, password) => {
    try {
      // Gọi API login qua authService
      // authService.login() → POST /api/auth/login
      // Body: { email, password }
      const response = await authService.login(email, password);
      
      // Destructure response để lấy token và user data
      // VD response: { token: "jwt...", user: { id, name, email } }
      const { token, user: userData } = response;
      
      // Lưu token vào localStorage để persist login
      // Token này sẽ được gửi kèm mọi API request
      localStorage.setItem('token', token);
      
      // Cập nhật user state
      setUser(userData);
      
      // Hiển thị toast notification thành công
      toast.success('Đăng nhập thành công!');
      
      // Return true để component biết login OK
      return true;
    } catch (error) {
      // Nếu có lỗi (sai password, user không tồn tại, etc.)
      // Hiển thị error message từ API hoặc message mặc định
      toast.error(error.message || 'Đăng nhập thất bại');
      
      // Return false để component biết login failed
      return false;
    }
  }, []); // Empty deps vì không phụ thuộc state/props nào

  /* ========================================
     REGISTER FUNCTION
     Đăng ký user mới
     
     Luồng tương tự login:
     1. Call API register
     2. Nhận token + user
     3. Lưu token, set user
     4. Auto login sau khi register
     
     Params:
     - userData: { name, email, password, ... }
  ======================================== */
  const register = useCallback(async (userData) => {
    try {
      // Gọi API register qua authService
      // authService.register() → POST /api/auth/register
      // Body: { name, email, password }
      const response = await authService.register(userData);
      
      // Destructure response giống login
      const { token, user: newUser } = response;
      
      // Lưu token để auto login
      localStorage.setItem('token', token);
      
      // Set user mới vào state
      setUser(newUser);
      
      // Show success notification
      toast.success('Đăng ký thành công!');
      
      return true;
    } catch (error) {
      // Handle errors: email đã tồn tại, password yếu, etc.
      toast.error(error.message || 'Đăng ký thất bại');
      return false;
    }
  }, []);

  /* ========================================
     LOGOUT FUNCTION
     Đăng xuất user
     
     Luồng:
     1. Call API logout (invalidate token trên server)
     2. Xóa token khỏi localStorage
     3. Set user = null
     4. Socket sẽ disconnect (ở SocketContext)
  ======================================== */
  const logout = useCallback(async () => {
    try {
      // Gọi API logout (optional - để invalidate token server-side)
      // authService.logout() → POST /api/auth/logout
      await authService.logout();
      
      // Xóa token khỏi localStorage
      localStorage.removeItem('token');
      
      // Set user = null → app sẽ redirect về login
      setUser(null);
      
      // Show logout notification
      toast.success('Đăng xuất thành công!');
    } catch (error) {
      // Nếu API lỗi vẫn logout local
      console.error('Logout error:', error);
      
      // Force logout: xóa token và user dù API fail
      localStorage.removeItem('token');
      setUser(null);
    }
  }, []);

  /* ========================================
     UPDATE USER FUNCTION
     Cập nhật thông tin user (name, avatar, etc.)
     
     Dùng khi:
     - User edit profile
     - Upload avatar mới
     - Change settings
     
     Params:
     - userData: object chứa fields cần update
       VD: { name: "New Name" } hoặc { avatar: "url" }
  ======================================== */
  const updateUser = useCallback((userData) => {
    // Merge userData mới với user hiện tại
    // ...prev: giữ lại các fields cũ
    // ...userData: override các fields mới
    setUser((prev) => ({ ...prev, ...userData }));
  }, []);

  /* ========================================
     CONTEXT VALUE
     Object này sẽ được provide cho toàn bộ app
     Mọi component dùng useAuth() sẽ nhận được object này
  ======================================== */
  const value = {
    user,              // User hiện tại: { id, name, email, avatar }
    loading,           // Loading state: true/false
    login,             // Function: login(email, password)
    register,          // Function: register(userData)
    logout,            // Function: logout()
    updateUser,        // Function: updateUser(userData)
    isAuthenticated: !!user,  // Boolean: true nếu có user (đã login)
                              // !! convert object → boolean
                              // null → false, object → true
  };

  /* ========================================
     RENDER PROVIDER
     Wrap children với AuthContext.Provider
     Pass value object xuống mọi component con
  ======================================== */
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

/* ========================================
   CÁCH DÙNG TRONG COMPONENT:
   
   import { useAuth } from './context/AuthContext';
   
   function MyComponent() {
     const { user, login, logout, isAuthenticated } = useAuth();
     
     if (!isAuthenticated) {
       return <LoginForm onSubmit={login} />;
     }
     
     return (
       <div>
         <h1>Hello {user.name}!</h1>
         <button onClick={logout}>Logout</button>
       </div>
     );
   }
======================================== */
