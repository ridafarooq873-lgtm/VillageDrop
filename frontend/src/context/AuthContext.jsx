import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api, { TOKEN_KEY } from '../api/axios';

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
    loadUser();
  }, [loadUser]);

  const login = useCallback(
    async ({ email, password }) => {
      const { data } = await api.post('/auth/login', { email, password });
      persistToken(data.accessToken);
      setUser(data.user);
      return data.user;
    },
    [persistToken]
  );

  const register = useCallback(
    async (payload) => {
      const { data } = await api.post('/auth/register', payload);
      persistToken(data.accessToken);
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
