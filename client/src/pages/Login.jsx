import { useState } from 'react';
import { Link, useNavigate, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import AuthLayout from '../layouts/AuthLayout';
import Field from '../components/Field';
import Alert from '../components/Alert';
import { useAuth } from '../lib/AuthContext';
import { errorText } from '../lib/errors';

export default function Login() {
  const { t, i18n } = useTranslation();
  const { user, login } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/app" replace />;

  async function submit(e) {
    e.preventDefault(); setError(null); setBusy(true);
    try { await login(form.email, form.password); nav('/app', { replace: true }); }
    catch (err) {
      let msg = errorText(err);
      if (err.code === 'ACCOUNT_SUSPENDED' && err.details) {
        if (err.details.reason) msg += ' ' + t('suspendedReason', { reason: err.details.reason });
        if (err.details.until) msg += ' ' + t('suspendedUntil', { date: new Date(err.details.until).toLocaleString(i18n.language) });
      }
      setError(msg);
    } finally { setBusy(false); }
  }

  return (
    <AuthLayout title={t('login.title')} subtitle={t('login.subtitle')}
      footer={<>{t('login.noAccount')} <Link to="/register" className="font-medium text-mark hover:underline">{t('login.register')}</Link></>}>
      <form onSubmit={submit} className="space-y-5" noValidate>
        <Alert>{error}</Alert>
        <Field label={t('common.email')}>{(id) => (
          <input id={id} type="email" autoComplete="username" required className="input" dir="ltr"
            value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />)}</Field>
        <Field label={t('common.password')}>{(id) => (
          <input id={id} type="password" autoComplete="current-password" required className="input" dir="ltr"
            value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />)}</Field>
        <button className="btn-primary w-full" disabled={busy}>{busy ? t('common.loading') : t('login.submit')}</button>
        <div className="text-sm"><Link to="/forgot-password" className="text-mark hover:underline">{t('login.forgot')}</Link></div>
      </form>
    </AuthLayout>
  );
}
