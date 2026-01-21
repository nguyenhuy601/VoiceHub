/* ========================================
   API.JS - AXIOS INSTANCE & INTERCEPTORS
   Core API client cho toàn bộ app
   
   Chức năng:
   - Tạo axios instance với base config
   - Auto thêm token vào mọi request
   - Handle errors globally
   - Show toast notifications
   - Auto redirect 401 → login
   
   Kết nối đến: api-gateway (port 8000)
   Gateway route request đến các microservices
======================================== */

// Import axios - HTTP client library
import axios from 'axios';

// Import toast để show error notifications
import toast from 'react-hot-toast';

/* ========================================
   API BASE URL
   - Production: lấy từ .env → VITE_API_URL
   - Development: http://localhost:8000/api
   
   API Gateway sẽ route:
   /api/auth/* → auth-service (port 4000)
   /api/users/* → user-service (port 4001)
   /api/chat/* → chat-system-service (port 4002)
   /api/organizations/* → organization-service (port 4003)
   /api/tasks/* → task-service (port 4004)
   /api/friends/* → friend-service (port 4005)
======================================== */
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

/* ========================================
   TẠO AXIOS INSTANCE
   Instance này sẽ được dùng bởi tất cả services
   (authService, chatService, userService, ...)
======================================== */
const api = axios.create({
  // Base URL cho mọi request
  // VD: api.get('/auth/me') → GET http://localhost:8000/api/auth/me
  baseURL: API_URL,
  
  // Timeout: 30 giây (30000ms)
  // Request quá 30s → throw timeout error
  timeout: 30000,
  
  // Default headers cho mọi request
  headers: {
    // Content-Type: JSON (mọi request gửi JSON)
    'Content-Type': 'application/json',
  },
});

/* ========================================
   REQUEST INTERCEPTOR
   Chạy TRƯỚC KHI gửi mọi request
   
   Nhiệm vụ:
   - Tự động thêm token vào header
   - Không cần manually add token mỗi lần call API
   
   Luồng:
   1. Service gọi api.get('/users')
   2. Interceptor chặn request
   3. Lấy token từ localStorage
   4. Thêm vào header: Authorization: Bearer <token>
   5. Gửi request đi
======================================== */
api.interceptors.request.use(
  // Success handler: modify config trước khi gửi
  (config) => {
    // Lấy token từ localStorage (được lưu khi login)
    const token = localStorage.getItem('token');
    
    // Nếu có token → thêm vào Authorization header
    if (token) {
      // Format: "Bearer <token>" (JWT standard)
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    // Return config để request được gửi đi
    return config;
  },
  
  // Error handler: nếu có lỗi khi prepare request
  (error) => {
    // Reject promise → catch block sẽ bắt lỗi
    return Promise.reject(error);
  }
);

/* ========================================
   RESPONSE INTERCEPTOR
   Chạy SAU KHI nhận response từ server
   
   Nhiệm vụ:
   - Unwrap response.data (không cần .data.data)
   - Handle errors globally
   - Show toast notifications
   - Auto logout khi 401 (Unauthorized)
   - Redirect tương ứng với error code
   
   Luồng:
   1. Server trả response
   2. Interceptor chặn response
   3. Nếu success → return data
   4. Nếu error → show toast, handle theo status code
======================================== */
api.interceptors.response.use(
  /* ----- SUCCESS HANDLER -----
     Response OK (status 200-299) */
  (response) => {
    // Unwrap data: response.data thay vì response.data.data
    // Server trả: { data: { user: {...} } }
    // Interceptor return: { user: {...} }
    // Service nhận trực tiếp data, không cần .data
    return response.data;
  },
  
  /* ----- ERROR HANDLER -----
     Response lỗi (status 400+, 500+, network error) */
  (error) => {
    // Lấy error message từ response hoặc dùng default
    // Priority: server message > axios message > default
    const message = error.response?.data?.message || error.message || 'Đã xảy ra lỗi';
    
    /* ===== XỬ LÝ THEO STATUS CODE ===== */
    
    // 401 Unauthorized: Token invalid hoặc expired
    if (error.response?.status === 401) {
      // Xóa token lỗi khỏi localStorage
      localStorage.removeItem('token');
      
      // Redirect về trang login
      // window.location.href: hard redirect (reload page)
      window.location.href = '/login';
      
      // Show notification
      toast.error('Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.');
    } 
    // 403 Forbidden: Không có quyền
    else if (error.response?.status === 403) {
      toast.error('Bạn không có quyền thực hiện hành động này');
    } 
    // 404 Not Found: Resource không tồn tại
    else if (error.response?.status === 404) {
      toast.error('Không tìm thấy dữ liệu');
    } 
    // 500+ Server Error: Lỗi server
    else if (error.response?.status >= 500) {
      toast.error('Lỗi server. Vui lòng thử lại sau.');
    }
    // Các lỗi khác (400, 422, etc.) không show toast
    // Component tự handle (validation errors, etc.)

    // Reject với error object có cấu trúc nhất quán
    return Promise.reject({
      message,                        // Error message
      status: error.response?.status, // HTTP status code
      data: error.response?.data,     // Full error data từ server
    });
  }
);

// Export default api instance
// Services import: import api from './api'
export default api;

/* ========================================
   HELPER FUNCTIONS
   Shorthand cho các HTTP methods
   
   Thay vì: api.get(url, config)
   Dùng: apiGet(url, config)
   
   Optional - có thể dùng hoặc không
======================================== */

// GET request: Lấy dữ liệu
// VD: apiGet('/users/123')
export const apiGet = (url, config) => api.get(url, config);

// POST request: Tạo mới
// VD: apiPost('/users', { name: 'John' })
export const apiPost = (url, data, config) => api.post(url, data, config);

// PUT request: Update toàn bộ
// VD: apiPut('/users/123', { name: 'John Updated' })
export const apiPut = (url, data, config) => api.put(url, data, config);

// PATCH request: Update một phần
// VD: apiPatch('/users/123', { name: 'New Name' })
export const apiPatch = (url, data, config) => api.patch(url, data, config);

// DELETE request: Xóa
// VD: apiDelete('/users/123')
export const apiDelete = (url, config) => api.delete(url, config);

/* ========================================
   FLOW DIAGRAM: API REQUEST
   
   Component/Service
        |
        | api.get('/users')
        ↓
   Request Interceptor
        | + Add token to header
        | + Modify config
        ↓
   HTTP Request → Server
        |
        ↓
   Server Response
        |
        ↓
   Response Interceptor
        | + Unwrap data
        | + Handle errors
        | + Show toasts
        ↓
   Component/Service receives data
======================================== */
