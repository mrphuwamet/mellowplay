import axios from 'axios';
import { API_URL } from '../config';

// Every CRM page calls the shared default `axios` singleton directly
// (no axios.create() instances anywhere in this app), so a single global
// interceptor here covers every request without touching each page.
// The backend now requires a CRM staff JWT on /api/v1/admin/* and
// /api/v1/system/* — previously no page attached it, which only "worked"
// because those routes had no auth check at all.
axios.interceptors.request.use((config) => {
  if (config.url?.startsWith(API_URL)) {
    const token = localStorage.getItem('crm_token');
    if (token) {
      config.headers = config.headers ?? {};
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

axios.interceptors.response.use(
  (response) => response,
  (error) => {
    const isLoginRequest = error.config?.url?.includes('/auth/admin/login');
    if (error.response?.status === 401 && !isLoginRequest) {
      localStorage.removeItem('crm_token');
      localStorage.removeItem('crm_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);
