import apiClient from './apiClient';

export const authAPI = {
  // Register new user
  register: async (data) => {
    const response = await apiClient.post('/auth/register', data);
    return response;
  },

  // Login user
  login: async (data) => {
    const response = await apiClient.post('/auth/login', data);
    return response;
  },

  // Logout user
  logout: async () => {
    const response = await apiClient.post('/auth/logout');
    return response;
  },

  // Get current user
  getMe: async () => {
    const response = await apiClient.get('/auth/me');
    return response;
  },

  // Refresh access token
  refreshToken: async () => {
    const refreshToken = localStorage.getItem('refreshToken');
    const response = await apiClient.post('/auth/refresh', { refreshToken });
    return response;
  },

  // Request password reset
  forgotPassword: async (email) => {
    const response = await apiClient.post('/auth/forgot-password', { email });
    return response;
  },

  // Reset password with token
  resetPassword: async (token, password) => {
    const response = await apiClient.post('/auth/reset-password', { token, password });
    return response;
  },

  // Verify email
  verifyEmail: async (token) => {
    // Dùng GET với token trong query string, KHÔNG dùng JWT
    const response = await apiClient.get(`/auth/verify-email?token=${encodeURIComponent(token)}`);
    return response;
  },

  // Resend verification email
  resendVerification: async () => {
    const response = await apiClient.post('/auth/resend-verification');
    return response;
  },
};
