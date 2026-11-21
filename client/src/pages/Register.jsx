import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import AuthLayout from '../layouts/AuthLayout';
import Field from '../components/Field';
import Alert from '../components/Alert';
import { api } from '../lib/api';
import { errorText, fieldErrors } from '../lib/errors';

export default function Register() {
  const { t, i18n } = useTranslation();
  const [role, setRole] = useState('STUDENT');
  const [f, setF] = useState({ firstName: '', lastName: '', email: '', password: '', matricule: '', departmentId: '', classId: '', title: '' });
  const [depts, setDepts] = useState([]);
  const [classes, setClasses] = useState([]);
  const [error, setError] = useState(null);
  const [fields, setFields] = useState({});
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  useEffect(() => { api.get('/academic/departments').then(setDepts).catch(() => {}); }, []);
  useEffect(() => {
    setClasses([]);
    if (f.departmentId) api.get(`/academic/classes?departmentId=${f.departmentId}`).then(setClasses).catch(() => {});
  }, [f.departmentId]);

  async function submit(e) {
    e.preventDefault(); setError(null); setFields({}); setBusy(true);
    const base = { role, email: f.email, password: f.password, firstName: f.firstName, lastName: f.lastName, locale: i18n.language };
    const body = role === 'STUDENT'
      ? { ...base, matricule: f.matricule, ...(f.classId && { classId: f.classId }) }
      : { ...base, ...(f.departmentId && { departmentId: f.departmentId }), ...(f.title && { title: f.title }) };
    try { await api.post('/auth/register', body); setSent(true); }
    catch (err) { setError(errorText(err)); setFields(fieldErrors(err)); }
    finally { setBusy(false); }
  }

  if (sent) {
    return (
      <AuthLayout title={t('register.sent')} footer={<Link to="/login" className="font-medium text-mark hover:underline">{t('common.back')}</Link>}>
        <Alert kind="ok">{t('register.sentBody')}</Alert>
      </AuthLayout>
    );
  }

  const text = (k, label, extra = {}, opts = {}) => (
    <Field label={label} error={fields[k]} {...opts}>{(id) => (
      <input id={id} className="input" value={f[k]} onChange={set(k)} {...extra} />)}</Field>
  );

  return (
    <AuthLayout title={t('register.title')} subtitle={t('register.subtitle')}
      footer={<>{t('register.haveAccount')} <Link to="/login" className="font-medium text-mark hover:underline">{t('login.title')}</Link></>}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Alert>{error}</Alert>
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">{t('register.iAm')}</legend>
          <div className="grid grid-cols-2 gap-2" role="radiogroup">
            {['STUDENT', 'PROFESSOR'].map((r) => (
              <label key={r} className={`cursor-pointer rounded-md border px-3 py-2.5 text-center text-sm ${role === r ? 'border-mark bg-mark-tint font-medium text-mark' : 'border-line bg-white'}`}>
                <input type="radio" name="role" value={r} checked={role === r} onChange={() => setRole(r)} className="sr-only" />
                {t(r === 'STUDENT' ? 'register.student' : 'register.professor')}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          {text('firstName', t('common.firstName'), { required: true, autoComplete: 'given-name' })}
          {text('lastName', t('common.lastName'), { required: true, autoComplete: 'family-name' })}
        </div>
        {text('email', t('common.email'), { type: 'email', required: true, dir: 'ltr', autoComplete: 'username' })}
        {text('password', t('common.password'), { type: 'password', required: true, dir: 'ltr', autoComplete: 'new-password' }, { hint: t('register.passwordHint') })}
        {role === 'STUDENT' && text('matricule', t('register.matricule'), { required: true, dir: 'ltr' })}
        <Field label={t('register.department')} optionalLabel={role === 'STUDENT' ? undefined : t('common.optional')}>{(id) => (
          <select id={id} className="input" value={f.departmentId} onChange={set('departmentId')}>
            <option value="">—</option>
            {depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>)}</Field>
        {role === 'STUDENT' && (
          <Field label={t('register.class')} optionalLabel={t('common.optional')}>{(id) => (
            <select id={id} className="input" value={f.classId} onChange={set('classId')} disabled={!f.departmentId}>
              <option value="">—</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.academic_year})</option>)}
            </select>)}</Field>
        )}
        {role === 'PROFESSOR' && text('title', t('register.titleField'), {}, { optionalLabel: t('common.optional') })}
        <button className="btn-primary w-full" disabled={busy}>{busy ? t('common.loading') : t('register.submit')}</button>
      </form>
    </AuthLayout>
  );
}
