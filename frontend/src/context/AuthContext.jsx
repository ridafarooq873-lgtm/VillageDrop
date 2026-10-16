import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api, { REFRESH_TOKEN_KEY, TOKEN_KEY } from '../api/axios';

export const AuthContext = createContext(null);

const readToken = () => localStorage.getItem(TOKEN_KEY);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(readToken);
  const [loading, setLoading] = useState(Boolean(readToken()));

  const persistToken = useCallback((nextToken) => {
    if (nextToken) {
      localStorage.setItem(TOKEN_KEY, nextToken);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
    setToken(nextToken);
  }, []);

  // Restore the session on first load.
  const loadUser = useCallback(async () => {
    if (!readToken()) {
      setUser(null);
      setLoading(false);
      return null;
    }

    try {
      const { data } = await api.get('/auth/me');
      setUser(data.data);
      return data.data;
    } catch {
      persistToken(null);
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, [persistToken]);

  useEffect(() => {
    const onTokenRefreshed = (event) => setToken(event.detail.accessToken);
    const onSessionExpired = () => {
      setToken(null);
      setUser(null);
    };
    window.addEventListener('auth:token-refreshed', onTokenRefreshed);
    window.addEventListener('auth:session-expired', onSessionExpired);
    return () => {
      window.removeEventListener('auth:token-refreshed', onTokenRefreshed);
      window.removeEventListener('auth:session-expired', onSessionExpired);
    };
  }, []);

  useEffect(() => {
    if (readToken()) {
      loadUser();
    }
  }, [loadUser]);

  const login = useCallback(
    async ({ email, password }) => {
      const { data } = await api.post('/auth/login', { email, password });
      persistToken(data.accessToken);
      localStorage.setItem(REFRESH_TOKEN_KEY, data.refreshToken);
      setUser(data.user);
      return data.user;
    },
    [persistToken]
  );

  const register = useCallback(
    async (payload) => {
      const { data } = await api.post('/auth/register', payload);
      persistToken(data.accessToken);
      localStorage.setItem(REFRESH_TOKEN_KEY, data.refreshToken);
      setUser(data.user);
      return data.user;
    },
    [persistToken]
  );

  const logout = useCallback(async () => {
    try {
      if (readToken()) {
        await api.post('/auth/logout');
      }
    } catch {
      // Ignore network errors on logout.
    } finally {
      persistToken(null);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
      setUser(null);
    }
  }, [persistToken]);

  const value = useMemo(
    () => ({ user, token, loading, login, register, logout, refreshUser: loadUser }),
    [user, token, loading, login, register, logout, loadUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
