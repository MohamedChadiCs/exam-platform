import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, setCsrf, setAuthToken } from './api';

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    api.get('/auth/me')
      .then((d) => { setCsrf(d.csrfToken); setUser(d.user); })
      .catch(() => { setAuthToken(''); })
      .finally(() => setReady(true));
  }, []);

  const login = useCallback(async (email, password) => {
    const d = await api.post('/auth/login', { email, password });
    if (d?.token) setAuthToken(d.token);
    setCsrf(d.csrfToken); setUser(d.user);
    return d.user;
  }, []);

  const setSession = useCallback((data) => {
    if (data?.token) setAuthToken(data.token);
    setCsrf(data.csrfToken); setUser(data.user);
  }, []);

  const logout = useCallback(async () => {
    try { await api.post('/auth/logout'); } finally { setCsrf(''); setAuthToken(''); setUser(null); }
  }, []);

  return <Ctx.Provider value={{ user, ready, login, logout, setSession }}>{children}</Ctx.Provider>;
}
