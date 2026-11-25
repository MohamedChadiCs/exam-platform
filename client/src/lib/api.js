// Thin fetch wrapper: cookies + Bearer auth fallback, CSRF header on writes, normalised errors.
let csrfToken = '';
export const setCsrf = (t) => { csrfToken = t || ''; };

let authToken = typeof window !== 'undefined' ? (localStorage.getItem('authToken') || '') : '';
export const setAuthToken = (t) => {
  authToken = t || '';
  if (typeof window !== 'undefined') {
    if (t) localStorage.setItem('authToken', t);
    else localStorage.removeItem('authToken');
  }
};

export class ApiError extends Error {
  constructor(status, code, message, details) { super(message); this.status = status; this.code = code; this.details = details; }
}

const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL.replace(/\/$/, '')}/api/v1`
  : '/api/v1';

async function request(method, path, body) {
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method, credentials: 'include',
      headers: {
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
        ...(method !== 'GET' && csrfToken && { 'X-CSRF-Token': csrfToken }),
        ...(authToken && { 'Authorization': `Bearer ${authToken}` }),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Network error');
  }
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) {
    const e = json?.error ?? {};
    throw new ApiError(res.status, e.code ?? 'GENERIC', e.message ?? 'Request failed', e.details);
  }
  return json.data;
}

export const api = {
  get: (p) => request('GET', p),
  post: (p, b = {}) => request('POST', p, b),
  put: (p, b = {}) => request('PUT', p, b),
  delete: (p) => request('DELETE', p),
  uploadUrl: (attachmentId) => `${API_BASE}/uploads/${attachmentId}`,
};
