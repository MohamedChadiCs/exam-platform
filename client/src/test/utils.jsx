import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import i18n from '../i18n';
import App from '../App';
import { AuthProvider } from '../lib/AuthContext';

/** routes: { 'GET /auth/me': () => ({status, body}) | data }. Records every call in `calls`. */
export function mockApi(routes) {
  const calls = [];
  globalThis.fetch = vi.fn(async (url, init = {}) => {
    const path = String(url).replace('/api/v1', '').split('?')[0];
    const key = `${init.method ?? 'GET'} ${path}`;
    calls.push({ key, headers: init.headers ?? {}, body: init.body ? JSON.parse(init.body) : undefined });
    const h = routes[key];
    if (!h) return new Response(JSON.stringify({ success: false, error: { code: 'NOT_FOUND', message: 'x' } }), { status: 404 });
    const r = typeof h === 'function' ? h(calls.at(-1)) : h;
    const status = r?.status ?? 200;
    const body = r?.body ?? { success: true, data: r };
    return new Response(JSON.stringify(body), { status });
  });
  return calls;
}
export const unauth = () => ({ status: 401, body: { success: false, error: { code: 'UNAUTHORIZED', message: 'x' } } });
export const meOf = (role, extra = {}) => ({ user: { id: 'u1', email: `${role}@x.dz`, firstName: 'Sara', lastName: 'B', role, locale: 'fr', ...extra }, csrfToken: 'csrf-123' });

export function renderApp(path = '/login') {
  i18n.changeLanguage('fr');
  return render(<MemoryRouter initialEntries={[path]}><AuthProvider><App /></AuthProvider></MemoryRouter>);
}
