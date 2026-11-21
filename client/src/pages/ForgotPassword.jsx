import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import AuthLayout from '../layouts/AuthLayout';
import Field from '../components/Field';
import Alert from '../components/Alert';
import { api } from '../lib/api';
import { errorText } from '../lib/errors';

export default function ForgotPassword() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault(); setError(null); setBusy(true);
    try { await api.post('/auth/forgot-password', { email }); setSent(true); }
    catch (err) { setError(errorText(err)); }
    finally { setBusy(false); }
  }
  return (
    <AuthLayout title={t('forgot.title')} subtitle={t('forgot.subtitle')}
      footer={<Link to="/login" className="font-medium text-mark hover:underline">{t('common.back')}</Link>}>
      {sent ? <Alert kind="ok">{t('forgot.sent')}</Alert> : (
        <form onSubmit={submit} className="space-y-5" noValidate>
          <Alert>{error}</Alert>
          <Field label={t('common.email')}>{(id) => (
            <input id={id} type="email" required className="input" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} />)}</Field>
          <button className="btn-primary w-full" disabled={busy}>{busy ? t('common.loading') : t('forgot.submit')}</button>
        </form>)}
    </AuthLayout>
  );
}
