import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import AuthLayout from '../layouts/AuthLayout';
import Alert from '../components/Alert';
import { api } from '../lib/api';

export default function VerifyEmail() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const [state, setState] = useState('working');
  const started = useRef(false); // tokens are single-use: never fire twice (React StrictMode)

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = params.get('token');
    if (!token) { setState('fail'); return; }
    api.post('/auth/verify-email', { token }).then(() => setState('ok')).catch(() => setState('fail'));
  }, [params]);

  const title = { working: t('verify.working'), ok: t('verify.ok'), fail: t('verify.fail') }[state];
  return (
    <AuthLayout title={title} footer={<Link to="/login" className="font-medium text-mark hover:underline">{t('common.back')}</Link>}>
      {state === 'ok' && <Alert kind="ok">{t('verify.okBody')}</Alert>}
      {state === 'fail' && <Alert>{t('verify.failBody')}</Alert>}
    </AuthLayout>
  );
}
