import axios from 'axios';

const API_BASE_URL = 'http://localhost:8787/api/v1';

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

// Interceptor to handle 401 Unauthorized
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('mellow_token');
      localStorage.removeItem('mellow_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default apiClient;
