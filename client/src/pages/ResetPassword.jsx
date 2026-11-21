import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import AuthLayout from '../layouts/AuthLayout';
import Field from '../components/Field';
import Alert from '../components/Alert';
import { api } from '../lib/api';
import { errorText, fieldErrors } from '../lib/errors';

export default function ResetPassword() {
  const { t } = useTranslation();
  const token = useSearchParams()[0].get('token');
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);
  const [fields, setFields] = useState({});
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault(); setError(null); setFields({}); setBusy(true);
    try { await api.post('/auth/reset-password', { token, password }); setDone(true); }
    catch (err) { setError(errorText(err)); setFields(fieldErrors(err)); }
    finally { setBusy(false); }
  }
  const back = <Link to="/login" className="font-medium text-mark hover:underline">{t('common.back')}</Link>;
  if (!token) return <AuthLayout title={t('reset.title')} footer={back}><Alert>{t('reset.missing')}</Alert></AuthLayout>;
  return (
    <AuthLayout title={t('reset.title')} footer={back}>
      {done ? <Alert kind="ok">{t('reset.ok')}</Alert> : (
        <form onSubmit={submit} className="space-y-5" noValidate>
          <Alert>{error}</Alert>
          <Field label={t('common.password')} hint={t('register.passwordHint')} error={fields.password}>{(id) => (
            <input id={id} type="password" required autoComplete="new-password" className="input" dir="ltr"
              value={password} onChange={(e) => setPassword(e.target.value)} />)}</Field>
          <button className="btn-primary w-full" disabled={busy}>{busy ? t('common.loading') : t('reset.submit')}</button>
        </form>)}
    </AuthLayout>
  );
}
