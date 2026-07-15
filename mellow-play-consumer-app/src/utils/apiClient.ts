import axios from 'axios';

const apiHost = (import.meta.env.VITE_API_URL as string) || 'http://localhost:8787';
export const API_BASE_URL = `${apiHost}/api/v1`;

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor to add Bearer token to requests
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('mellow_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Interceptor to handle 401 Unauthorized — but not for auth endpoints
// themselves, where a 401 just means "wrong credentials", not "session expired".
const AUTH_ENDPOINTS = ['/auth/login', '/auth/google'];

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const isAuthEndpoint = AUTH_ENDPOINTS.some((path) => error.config?.url?.includes(path));
    if (error.response?.status === 401 && !isAuthEndpoint) {
      localStorage.removeItem('mellow_token');
      localStorage.removeItem('mellow_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default apiClient;
