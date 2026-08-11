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
      // `config.headers` is always an AxiosHeaders instance inside a request
      // interceptor (axios 1.x), so no null-guard is needed here.
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

axios.interceptors.response.use(
  (response) => response,
  (error) => {
    const url: string | undefined = error.config?.url;
    const isLoginRequest = url?.includes('/auth/admin/login');

    // A 401 only means "your session expired" when it came back from OUR api.
    // The request interceptor above attaches the token under exactly this
    // condition, so a 401 from anywhere else is a request that was never
    // authenticated in the first place — treating it as an expired session
    // logged the user out over a bug that had nothing to do with their session.
    //
    // This is not hypothetical: RewardsManagement used to target
    // `VITE_API_BASE_URL || 'http://localhost:8787/api/v1'`, and that variable
    // is not set in .env.production, so the deployed page called localhost.
    // That normally fails as a connection error, but on a developer's machine
    // with a local API running it reaches a real server, gets a correct 401 for
    // having no token, and threw the user out of the CRM.
    const isOwnApi = !!url && url.startsWith(API_URL);

    if (error.response?.status === 401 && isOwnApi && !isLoginRequest) {
      localStorage.removeItem('crm_token');
      localStorage.removeItem('crm_user');
      window.location.href = '/login';
    } else if (error.response?.status === 401 && !isOwnApi && !isLoginRequest) {
      // Loud rather than silent: a page pointing at the wrong host is a bug to
      // fix, and it must not look like a session problem to whoever hits it.
      console.error(
        `[axiosSetup] 401 from a non-API URL, session left intact. This request was sent without a token because it does not target ${API_URL}:`,
        url,
      );
    }
    return Promise.reject(error);
  }
);
