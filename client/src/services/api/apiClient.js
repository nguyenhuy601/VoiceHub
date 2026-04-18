import axios from 'axios';
import toast from 'react-hot-toast';
import { getToken, removeToken } from '../../utils/tokenStorage';
import { isLandingEmbedActive, isWriteHttpMethod } from '../../utils/landingEmbedMode';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

const normalizeToken = (rawToken) => {
  if (!rawToken) return null;
  let token = String(rawToken).trim();
  if (!token) return null;
  if (token.startsWith('Bearer ')) token = token.slice(7).trim();
  if (
    (token.startsWith('"') && token.endsWith('"')) ||
    (token.startsWith("'") && token.endsWith("'"))
  ) {
    token = token.slice(1, -1).trim();
  }
  if (!token || token === 'null' || token === 'undefined') return null;
  return token;
};

// Create axios instance
const apiClient = axios.create({
  baseURL: API_URL,
  timeout: 60000, // Tăng lên 60s để tránh timeout khi hash password hoặc database operations
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - Add auth token
apiClient.interceptors.request.use(
  (config) => {
    if (isLandingEmbedActive() && isWriteHttpMethod(config.method)) {
      toast('Chế độ demo — không ghi dữ liệu lên server.', { icon: '🔒', duration: 2800 });
      const block = new Error('LANDING_EMBED_WRITE_BLOCKED');
      block.code = 'LANDING_EMBED_WRITE_BLOCKED';
      block.isLandingEmbedBlock = true;
      return Promise.reject(block);
    }

    const token = normalizeToken(getToken());
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor - Handle errors
apiClient.interceptors.response.use(
  (response) => {
    return response.data;
  },
  (error) => {
    if (error?.code === 'LANDING_EMBED_WRITE_BLOCKED' || error?.isLandingEmbedBlock) {
      return Promise.reject(error);
    }

    const message = error.response?.data?.message || error.message || 'Đã xảy ra lỗi';
    
    // Handle specific error codes
    if (error.response?.status === 401) {
      // Unauthorized - clear token and redirect to login
      removeToken();
      window.location.href = '/login';
      toast.error('Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.');
    } else if (error.response?.status === 403) {
      toast.error('Bạn không có quyền thực hiện hành động này');
    } else if (error.response?.status === 404) {
      toast.error('Không tìm thấy dữ liệu');
    } else if (error.response?.status >= 500) {
      toast.error('Lỗi server. Vui lòng thử lại sau.');
    } else {
      toast.error(message);
    }

    return Promise.reject(error);
  }
);

export default apiClient;
