/* ========================================
   AUTHSERVICE.JS - AUTHENTICATION API SERVICE
   Xử lý tất cả API calls liên quan đến authentication
   
   Kết nối đến: auth-service (qua api-gateway)
   Base URL: /api/auth
   
   Các chức năng:
   - Register, Login, Logout
   - Get current user info
   - Update profile, Change password
   - Forgot/Reset password
   - Refresh token
======================================== */

// Import api instance từ ./api.js
// api đã có sẵn: base URL, interceptors, auth headers
import api from './api';

/* ========================================
   AUTHSERVICE OBJECT
   Chứa tất cả authentication methods
   Mỗi method return Promise với response data
======================================== */
const authService = {
  /* ----- REGISTER: Đăng ký user mới -----
     
     Gọi: POST /auth/register
     Body: { name, email, password }
     Return: { token, user: { id, name, email, avatar } }
     
     Được gọi từ: AuthContext.register()
     Component: RegisterPage.jsx */
  register: async (userData) => {
    // userData: { name, email, password, ... }
    // api.post tự động thêm token vào header (nếu có)
    const response = await api.post('/auth/register', userData);
    
    // response đã được xử lý bởi interceptor
    // Chỉ return data, không có .data.data
    return response;
  },

  /* ----- LOGIN: Đăng nhập -----
     
     Gọi: POST /auth/login
     Body: { email, password }
     Return: { token, user }
     
     Token sẽ được lưu vào localStorage bởi AuthContext
     Được gọi từ: AuthContext.login() */
  login: async (email, password) => {
    // Gửi email và password lên server
    const response = await api.post('/auth/login', { email, password });
    
    // Server trả về: { token: "jwt...", user: {...} }
    return response;
  },

  /* ----- LOGOUT: Đăng xuất -----
     
     Gọi: POST /auth/logout
     Header: Authorization: Bearer <token>
     
     Server sẽ invalidate token (blacklist)
     Được gọi từ: AuthContext.logout() */
  logout: async () => {
    // Gọi API để server invalidate token
    // Token được tự động thêm vào header bởi interceptor
    const response = await api.post('/auth/logout');
    
    // AuthContext sẽ xóa token khỏi localStorage
    return response;
  },

  /* ----- GET CURRENT USER: Lấy thông tin user hiện tại -----
     
     Gọi: GET /auth/me
     Header: Authorization: Bearer <token>
     Return: { id, name, email, avatar, ... }
     
     Được gọi khi:
     - App reload (check auth)
     - Cần refresh user info
     - Sau khi update profile */
  getCurrentUser: async () => {
    // GET /auth/me với token trong header
    // Server decode token → lấy userId → return user data
    const response = await api.get('/auth/me');
    return response;
  },

  /* ----- UPDATE PROFILE: Cập nhật thông tin cá nhân -----
     
     Gọi: PUT /auth/profile
     Body: { name?, avatar?, bio?, ... }
     Header: Authorization: Bearer <token>
     
     Cập nhật các fields: name, avatar, bio, location, etc.
     Được gọi từ: ProfilePage, SettingsPage */
  updateProfile: async (userData) => {
    // userData: object chứa các fields cần update
    // VD: { name: "New Name", avatar: "url" }
    const response = await api.put('/auth/profile', userData);
    
    // Return updated user data
    return response;
  },

  /* ----- CHANGE PASSWORD: Đổi mật khẩu -----
     
     Gọi: POST /auth/change-password
     Body: { oldPassword, newPassword }
     Header: Authorization: Bearer <token>
     
     Server verify oldPassword trước khi đổi
     Được gọi từ: SettingsPage → Security tab */
  changePassword: async (oldPassword, newPassword) => {
    // Gửi cả old và new password
    // Server sẽ:
    // 1. Verify oldPassword đúng
    // 2. Hash newPassword
    // 3. Update database
    const response = await api.post('/auth/change-password', {
      oldPassword,
      newPassword,
    });
    return response;
  },

  /* ----- FORGOT PASSWORD: Quên mật khẩu -----
     
     Gọi: POST /auth/forgot-password
     Body: { email }
     
     Server sẽ:
     1. Tìm user với email
     2. Tạo reset token (expire 1h)
     3. Gửi email với link reset
     
     Link: /reset-password?token=xxx
     Được gọi từ: ForgotPasswordPage */
  forgotPassword: async (email) => {
    // Chỉ cần email
    const response = await api.post('/auth/forgot-password', { email });
    
    // Return: { message: "Email đã được gửi" }
    return response;
  },

  /* ----- RESET PASSWORD: Đặt lại mật khẩu -----
     
     Gọi: POST /auth/reset-password
     Body: { token, newPassword }
     
     token: từ email (query param)
     Server verify token còn hạn → update password
     
     Được gọi từ: ResetPasswordPage */
  resetPassword: async (token, newPassword) => {
    // token: reset token từ email
    // newPassword: mật khẩu mới
    const response = await api.post('/auth/reset-password', {
      token,
      newPassword,
    });
    
    // Return: { message: "Đặt lại mật khẩu thành công" }
    // User có thể login với password mới
    return response;
  },

  /* ----- REFRESH TOKEN: Làm mới token -----
     
     Gọi: POST /auth/refresh-token
     Header: Authorization: Bearer <old-token>
     Return: { token: "new-jwt..." }
     
     Dùng khi:
     - Token sắp hết hạn
     - Response 401 từ API
     
     TODO: Implement auto refresh trong interceptor */
  refreshToken: async () => {
    // Gửi token cũ, nhận token mới
    const response = await api.post('/auth/refresh-token');
    
    // Return: { token: "new-jwt..." }
    // Cần update localStorage với token mới
    return response;
  },
};

// Export authService để dùng trong AuthContext và components
export default authService;

/* ========================================
   CÁCH DÙNG TRONG AUTHCONTEXT:
   
   // Register
   const response = await authService.register({
     name: "John Doe",
     email: "john@example.com",
     password: "password123"
   });
   // response: { token: "jwt...", user: {...} }
   
   // Login
   const response = await authService.login(
     "john@example.com",
     "password123"
   );
   
   // Get current user
   const user = await authService.getCurrentUser();
   // user: { id, name, email, avatar, ... }
======================================== */
