import axios from 'axios';

export const TOKEN_KEY = 'token';
export const REFRESH_TOKEN_KEY = 'refreshToken';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  headers: { 'Content-Type': 'application/json' },
});

let refreshRequest;

// Attach the stored access token to every request.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Clear the session when the token is no longer valid.
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const isAuthRequest = /\/auth\/(login|register|refresh-token|bootstrap-admin)(?:\?|$)/.test(
      originalRequest?.url || ''
    );
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry &&
      !isAuthRequest && refreshToken) {
      originalRequest._retry = true;
      try {
        refreshRequest ||= axios.post(
          `${api.defaults.baseURL.replace(/\/$/, '')}/auth/refresh-token`,
          { refreshToken }
        );
        const { data } = await refreshRequest;
        localStorage.setItem(TOKEN_KEY, data.accessToken);
        localStorage.setItem(REFRESH_TOKEN_KEY, data.refreshToken);
        originalRequest.headers = originalRequest.headers || {};
        originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
        window.dispatchEvent(new CustomEvent('auth:token-refreshed', {
          detail: { accessToken: data.accessToken },
        }));
        return api(originalRequest);
      } catch (refreshError) {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(REFRESH_TOKEN_KEY);
        window.dispatchEvent(new Event('auth:session-expired'));
        return Promise.reject(refreshError);
      } finally {
        refreshRequest = null;
      }
    }

    if (error.response?.status === 401 && !isAuthRequest) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
    }
    return Promise.reject(error);
  }
);

export default api;
