import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, setCsrf } from './api';

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    api.get('/auth/me')
      .then((d) => { setCsrf(d.csrfToken); setUser(d.user); })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  const login = useCallback(async (email, password) => {
    const d = await api.post('/auth/login', { email, password });
    setCsrf(d.csrfToken); setUser(d.user);
    return d.user;
  }, []);

  const logout = useCallback(async () => {
    try { await api.post('/auth/logout'); } finally { setCsrf(''); setUser(null); }
  }, []);

  return <Ctx.Provider value={{ user, ready, login, logout }}>{children}</Ctx.Provider>;
}
