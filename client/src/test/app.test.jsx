import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from '../i18n';
import { mockApi, unauth, meOf, renderApp } from './utils';

describe('i18n and direction', () => {
  it('keeps LTR layout with Arabic text when switching language', async () => {
    mockApi({ 'GET /auth/me': unauth });
    renderApp('/login');
    expect(await screen.findByRole('heading', { name: 'Connexion' })).toBeInTheDocument();
    expect(document.documentElement.dir).toBe('ltr');
    await userEvent.selectOptions(screen.getAllByLabelText('Langue')[0], 'ar');
    expect(await screen.findByRole('heading', { name: 'تسجيل الدخول' })).toBeInTheDocument();
    expect(document.documentElement.dir).toBe('ltr');
    expect(document.documentElement.lang).toBe('ar');
    await i18n.changeLanguage('fr');
    expect(document.documentElement.dir).toBe('ltr');
  });
  it('every language has exactly the same keys', async () => {
    const flat = (o, p = '') => Object.entries(o).flatMap(([k, v]) => typeof v === 'object' ? flat(v, `${p}${k}.`) : [`${p}${k}`]);
    const [en, fr, ar] = await Promise.all(['en', 'fr', 'ar'].map((l) => import(`../i18n/${l}.json`).then((m) => flat(m.default).sort())));
    expect(fr).toEqual(en);
    expect(ar).toEqual(en);
  });
});

describe('guards', () => {
  it('anonymous visiting /app is sent to login', async () => {
    mockApi({ 'GET /auth/me': unauth });
    renderApp('/app');
    expect(await screen.findByRole('heading', { name: 'Connexion' })).toBeInTheDocument();
  });
  it('student cannot reach the admin page (redirected to dashboard)', async () => {
    mockApi({ 'GET /auth/me': () => meOf('STUDENT') });
    renderApp('/app/admin/users');
    expect(await screen.findByText('Bienvenue, Sara')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Utilisateurs' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Utilisateurs' })).toBeNull();
  });
});

describe('login', () => {
  it('shows a localised error for wrong credentials', async () => {
    mockApi({ 'GET /auth/me': unauth, 'POST /auth/login': { status: 401, body: { success: false, error: { code: 'INVALID_CREDENTIALS', message: 'x' } } } });
    renderApp('/login');
    await userEvent.type(await screen.findByLabelText('E-mail'), 'a@b.dz');
    await userEvent.type(screen.getByLabelText('Mot de passe'), 'wrongwrongwrong');
    await userEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('E-mail ou mot de passe incorrect.');
  });
  it('suspended account shows the reason', async () => {
    mockApi({ 'GET /auth/me': unauth, 'POST /auth/login': { status: 403, body: { success: false, error: { code: 'ACCOUNT_SUSPENDED', message: 'x', details: { reason: 'Triche', until: null } } } } });
    renderApp('/login');
    await userEvent.type(await screen.findByLabelText('E-mail'), 'a@b.dz');
    await userEvent.type(screen.getByLabelText('Mot de passe'), 'whatever-pass');
    await userEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Motif : Triche');
  });
  it('success lands on the dashboard of the role', async () => {
    mockApi({ 'GET /auth/me': unauth, 'POST /auth/login': () => meOf('PROFESSOR') });
    renderApp('/login');
    await userEvent.type(await screen.findByLabelText('E-mail'), 'p@b.dz');
    await userEvent.type(screen.getByLabelText('Mot de passe'), 'Professor-Pass-1');
    await userEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
    expect(await screen.findByText('Bienvenue, Sara')).toBeInTheDocument();
    expect(screen.getAllByText('Banque de questions').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Pas encore développé').length).toBeGreaterThan(0); // honest: unbuilt modules say so
  });
});

describe('register', () => {
  const depts = [{ id: 'd1', code: 'CS', name: 'Computer Science' }];
  const classes = [{ id: 'c1', department_id: 'd1', name: 'L3', academic_year: '2026/2027' }];
  it('student payload is exactly what the API accepts; confirmation is shown', async () => {
    const calls = mockApi({ 'GET /auth/me': unauth, 'GET /academic/departments': depts, 'GET /academic/classes': classes,
      'POST /auth/register': { status: 202, body: { success: true, data: { message: 'ok' } } } });
    renderApp('/register');
    await userEvent.type(await screen.findByLabelText('Prénom'), 'Sara');
    await userEvent.type(screen.getByLabelText('Nom'), 'Ben');
    await userEvent.type(screen.getByLabelText('E-mail'), 'sara@x.dz');
    await userEvent.type(screen.getByLabelText('Mot de passe'), 'Student-Pass-123');
    await userEvent.type(screen.getByLabelText('Matricule'), 'M-1001');
    await userEvent.selectOptions(screen.getByLabelText('Département'), 'd1');
    await userEvent.selectOptions(await screen.findByLabelText(/Classe/), 'c1');
    await userEvent.click(screen.getByRole('button', { name: 'Créer le compte' }));
    expect(await screen.findByText('Vérifiez votre boîte mail')).toBeInTheDocument();
    const post = calls.find((c) => c.key === 'POST /auth/register');
    expect(post.body).toEqual({ role: 'STUDENT', email: 'sara@x.dz', password: 'Student-Pass-123', firstName: 'Sara',
      lastName: 'Ben', locale: 'fr', matricule: 'M-1001', classId: 'c1' });
  });
  it('professor form has no matricule and sends no student fields', async () => {
    const calls = mockApi({ 'GET /auth/me': unauth, 'GET /academic/departments': depts,
      'POST /auth/register': { status: 202, body: { success: true, data: {} } } });
    renderApp('/register');
    await userEvent.click(await screen.findByLabelText('Professeur'));
    expect(screen.queryByLabelText('Matricule')).toBeNull();
    await userEvent.type(screen.getByLabelText('Prénom'), 'Omar');
    await userEvent.type(screen.getByLabelText('Nom'), 'K');
    await userEvent.type(screen.getByLabelText('E-mail'), 'omar@x.dz');
    await userEvent.type(screen.getByLabelText('Mot de passe'), 'Professor-Pass-1');
    await userEvent.click(screen.getByRole('button', { name: 'Créer le compte' }));
    await screen.findByText('Vérifiez votre boîte mail');
    expect(calls.find((c) => c.key === 'POST /auth/register').body.role).toBe('PROFESSOR');
    expect(calls.find((c) => c.key === 'POST /auth/register').body).not.toHaveProperty('matricule');
  });
  it('field errors from the API appear under the field', async () => {
    mockApi({ 'GET /auth/me': unauth, 'GET /academic/departments': [],
      'POST /auth/register': { status: 400, body: { success: false, error: { code: 'VALIDATION_ERROR', message: 'x', details: [{ path: 'password', message: 'at least 10 characters' }] } } } });
    renderApp('/register');
    await userEvent.type(await screen.findByLabelText('Prénom'), 'S');
    await userEvent.type(screen.getByLabelText('Nom'), 'B');
    await userEvent.type(screen.getByLabelText('E-mail'), 's@x.dz');
    await userEvent.type(screen.getByLabelText('Mot de passe'), 'short');
    await userEvent.type(screen.getByLabelText('Matricule'), 'M-1');
    await userEvent.click(screen.getByRole('button', { name: 'Créer le compte' }));
    await waitFor(() => expect(screen.getByText('at least 10 characters')).toBeInTheDocument());
  });
});

describe('verify email', () => {
  it('consumes the single-use token exactly once, even under StrictMode', async () => {
    const calls = mockApi({ 'GET /auth/me': unauth, 'POST /auth/verify-email': { success: true, data: {} } });
    const { StrictMode } = await import('react');
    const { render } = await import('@testing-library/react');
    const { MemoryRouter } = await import('react-router-dom');
    const App = (await import('../App')).default;
    const { AuthProvider } = await import('../lib/AuthContext');
    render(<StrictMode><MemoryRouter initialEntries={['/verify-email?token=abcdefghijklmnopqrstuvwxyz']}><AuthProvider><App /></AuthProvider></MemoryRouter></StrictMode>);
    expect(await screen.findByText('E-mail vérifié')).toBeInTheDocument();
    expect(calls.filter((c) => c.key === 'POST /auth/verify-email')).toHaveLength(1);
  });
  it('a missing token shows failure without calling the API', async () => {
    const calls = mockApi({ 'GET /auth/me': unauth });
    renderApp('/verify-email');
    expect(await screen.findByText('Lien invalide ou expiré')).toBeInTheDocument();
    expect(calls.some((c) => c.key === 'POST /auth/verify-email')).toBe(false);
  });
});

describe('admin users', () => {
  const users = [
    { id: 'a1', email: 'stu@x.dz', first_name: 'Sara', last_name: 'Ben', role: 'STUDENT', status: 'ACTIVE', created_at: '2026-01-01T00:00:00Z', last_login_at: null },
    { id: 'a2', email: 'prof@x.dz', first_name: 'Omar', last_name: 'K', role: 'PROFESSOR', status: 'ACTIVE', created_at: '2026-01-01T00:00:00Z', last_login_at: null, verified_at: null },
  ];
  it('lists users and suspends one with reason; request carries the CSRF header', async () => {
    const calls = mockApi({ 'GET /auth/me': () => meOf('ADMIN'), 'GET /admin/users': users, 'POST /admin/users/a1/suspend': { id: 'a1', status: 'SUSPENDED' } });
    renderApp('/app/admin/users');
    expect(await screen.findByText('Sara Ben')).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: 'Suspendre' })[0]);
    await userEvent.type(screen.getByLabelText(/Motif/), 'Triche en examen');
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Suspendre' }));
    await waitFor(() => expect(calls.some((c) => c.key === 'POST /admin/users/a1/suspend')).toBe(true));
    const c = calls.find((x) => x.key === 'POST /admin/users/a1/suspend');
    expect(c.body).toEqual({ reason: 'Triche en examen' });
    expect(c.headers['X-CSRF-Token']).toBe('csrf-123');
  });
  it('offers "mark verified" only for unverified professors', async () => {
    mockApi({ 'GET /auth/me': () => meOf('ADMIN'), 'GET /admin/users': users });
    renderApp('/app/admin/users');
    await screen.findByText('Omar K');
    expect(screen.getAllByRole('button', { name: 'Marquer vérifié' })).toHaveLength(1);
  });
});
import { within } from '@testing-library/react';
