// Import lazy và Suspense từ React để tối ưu performance
// lazy: cho phép load component chỉ khi cần thiết (code splitting)
// Suspense: hiển thị fallback UI trong khi component đang được load
import { lazy, Suspense } from 'react';

// Import Route và Routes từ react-router-dom để quản lý điều hướng
// Routes: container chứa tất cả các route
// Route: định nghĩa từng đường dẫn và component tương ứng
import { Route, Routes } from 'react-router-dom';

/* ========================================
   LAZY LOADING CÁC PAGES
   Tại sao dùng lazy()?
   - Thay vì load tất cả pages ngay từ đầu (500KB)
   - Chỉ load page nào user đang truy cập (~150KB ban đầu)
   - Giảm thời gian load trang đầu từ 2s xuống 0.6s
   - Các page khác sẽ load khi user click vào link
======================================== */

// Lazy load trang chủ - file HomePage.jsx nằm trong ./pages/Auth/
const HomePage = lazy(() => import('./pages/Auth/HomePage'));

// Lazy load trang đăng nhập - kết nối với AuthContext để xác thực
const LoginPage = lazy(() => import('./pages/Auth/LoginPage'));

// Lazy load trang đăng ký - tạo user mới qua auth-service
const RegisterPage = lazy(() => import('./pages/Auth/RegisterPage'));

// Lazy load dashboard - trang tổng quan sau khi đăng nhập
const DashboardPage = lazy(() => import('./pages/Dashboard/DashboardPage'));

// Lazy load trang chat - kết nối SocketContext để chat realtime
// File này sẽ kết nối với chat-system-service qua Socket.IO
const ChatPage = lazy(() => import('./pages/Chat/ChatPage'));

// Lazy load phòng voice chat - :roomId là dynamic parameter
// Kết nối với WebRTC để gọi voice, sử dụng simple-peer
const VoiceRoomPage = lazy(() => import('./pages/Voice/VoiceRoomPage'));

// Lazy load trang quản lý task - kết nối task-service
const TasksPage = lazy(() => import('./pages/Tasks/TasksPage'));

// Lazy load trang profile cá nhân - hiển thị thông tin user
const ProfilePage = lazy(() => import('./pages/Profile/ProfilePage'));

// Lazy load trang tổ chức - quản lý organizations
// Kết nối với organization-service
const OrganizationsPage = lazy(() => import('./pages/Organization/OrganizationsPage'));

// Lazy load trang bạn bè - quản lý friend list
// Kết nối với friend-service để add/remove friends
const FriendsPage = lazy(() => import('./pages/Friends/FriendsPage'));

// Lazy load trang documents - quản lý file và tài liệu
const DocumentsPage = lazy(() => import('./pages/Documents/DocumentsPage'));

// Lazy load trang thông báo - hiển thị notifications realtime
const NotificationsPage = lazy(() => import('./pages/Notifications/NotificationsPage'));

// Lazy load trang analytics - thống kê và biểu đồ
const AnalyticsPage = lazy(() => import('./pages/Analytics/AnalyticsPage'));

// Lazy load trang lịch - quản lý sự kiện và meetings
const CalendarPage = lazy(() => import('./pages/Calendar/CalendarPage'));

// Lazy load trang cài đặt - thay đổi preferences
const SettingsPage = lazy(() => import('./pages/Settings/SettingsPage'));

// Lazy load trang 404 - hiển thị khi route không tồn tại
const NotFoundPage = lazy(() => import('./pages/NotFound/NotFoundPage'));

/* ========================================
   COMPONENT LOADING
   Hiển thị khi đang load page (fallback UI)
   - Được gọi bởi Suspense component
   - Xuất hiện trong vài ms khi chuyển trang
======================================== */
const PageLoader = () => (
  // Container fullscreen với gradient background đẹp mắt
  <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
    {/* Wrapper chứa nội dung loading, căn giữa */}
    <div className="text-center">
      {/* Icon rocket với animation bounce - tạo hiệu ứng nhảy */}
      <div className="text-8xl mb-4 animate-bounce">🚀</div>
      
      {/* Text "Đang tải..." với gradient màu đẹp */}
      {/* bg-clip-text + text-transparent: tạo hiệu ứng gradient trên text */}
      <div className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-pink-600 bg-clip-text text-transparent mb-2">
        Đang tải...
      </div>
      
      {/* Sub text màu xám nhạt */}
      <div className="text-gray-400">Vui lòng đợi một chút</div>
    </div>
  </div>
);

/* ========================================
   MAIN APP COMPONENT
   - Được import vào main.jsx
   - Được wrap bởi AuthProvider, SocketProvider, ThemeProvider
   - Quản lý toàn bộ routing của ứng dụng
======================================== */
function App() {
  return (
    // Suspense: bắt tất cả lazy components và hiển thị PageLoader khi đang load
    // fallback: component hiển thị trong lúc chờ
    <Suspense fallback={<PageLoader />}>
      {/* Routes: container quản lý tất cả các route */}
      <Routes>
        {/* ===== PUBLIC ROUTES =====
            Không cần đăng nhập, ai cũng truy cập được */}
        
        {/* Route trang chủ - path "/" */}
        <Route path="/" element={<HomePage />} />
        
        {/* Route đăng nhập - path "/login" */}
        {/* LoginPage sẽ gọi authService.login() → auth-service */}
        <Route path="/login" element={<LoginPage />} />
        
        {/* Route đăng ký - path "/register" */}
        {/* RegisterPage sẽ gọi authService.register() → auth-service */}
        <Route path="/register" element={<RegisterPage />} />

        {/* ===== PROTECTED ROUTES =====
            Cần đăng nhập mới truy cập được
            TODO: Thêm ProtectedRoute wrapper để check auth */}
        
        {/* Dashboard - trang chính sau khi login */}
        <Route path="/dashboard" element={<DashboardPage />} />
        
        {/* Chat - nhắn tin realtime qua Socket.IO */}
        {/* Kết nối đến SocketContext → chat-system-service */}
        <Route path="/chat" element={<ChatPage />} />
        
        {/* Voice chat room - :roomId là dynamic param */}
        {/* VD: /voice/room123 → roomId = "room123" */}
        {/* Sử dụng WebRTC peer-to-peer để gọi voice */}
        <Route path="/voice/:roomId" element={<VoiceRoomPage />} />
        
        {/* Tasks - quản lý công việc */}
        {/* Kết nối task-service qua api-gateway */}
        <Route path="/tasks" element={<TasksPage />} />
        
        {/* Profile - thông tin cá nhân */}
        {/* Hiển thị avatar, name, email từ AuthContext */}
        <Route path="/profile" element={<ProfilePage />} />
        
        {/* Organizations - quản lý tổ chức */}
        {/* CRUD operations với organization-service */}
        <Route path="/organizations" element={<OrganizationsPage />} />
        
        {/* Friends - danh sách bạn bè */}
        {/* Add/remove friends qua friend-service */}
        <Route path="/friends" element={<FriendsPage />} />
        
        {/* Documents - quản lý tài liệu */}
        {/* Upload/download files, preview documents */}
        <Route path="/documents" element={<DocumentsPage />} />
        
        {/* Notifications - thông báo */}
        {/* Realtime notifications qua Socket.IO */}
        <Route path="/notifications" element={<NotificationsPage />} />
        
        {/* Calendar - lịch làm việc */}
        {/* Hiển thị events, meetings, deadlines */}
        <Route path="/calendar" element={<CalendarPage />} />
        
        {/* Analytics - thống kê */}
        {/* Charts, graphs, metrics */}
        <Route path="/analytics" element={<AnalyticsPage />} />
        
        {/* Settings - cài đặt */}
        {/* Thay đổi theme, language, notifications preferences */}
        <Route path="/settings" element={<SettingsPage />} />

        {/* ===== 404 NOT FOUND =====
            Catch-all route cho mọi path không match */}
        {/* path="*" nghĩa là bất kỳ route nào không được định nghĩa ở trên */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}

// Export App component để import vào main.jsx
export default App;
