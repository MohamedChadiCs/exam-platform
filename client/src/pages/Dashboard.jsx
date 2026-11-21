import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../lib/AuthContext';

const MODULES = {
  ADMIN: [
    { k: 'mUsers', to: '/app/admin/users' },
    { k: 'mAcademic', to: '/app/admin/academic' },
  ],
  PROFESSOR: [
    { k: 'mQuestions', to: '/app/questions' },
    { k: 'mExams', to: '/app/exams' },
    { k: 'mCodes' },
  ],
  STUDENT: [
    { k: 'mJoin', to: '/app/exams/join' },
    { k: 'mTake', to: '/app/exams/take' },
    { k: 'mResults', to: '/app/results' },
  ],
};

export default function Dashboard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{t('dashboard.welcome', { name: user.firstName })}</h1>
      <p className="mt-1 text-ink-soft">{t(`dashboard.subtitle${user.role}`)}</p>
      <h2 className="mb-3 mt-10 text-sm font-medium text-ink-soft">{t('dashboard.modulesTitle')}</h2>
      <ul className="divide-y divide-line rounded-lg border border-line bg-white shadow-sm">
        {MODULES[user.role].map(({ k, to }) => (
          <li key={k} className="flex items-center justify-between px-4 py-3.5">
            {to ? (
              <Link to={to} className="font-medium text-mark hover:underline">
                {t(`dashboard.${k}`)}
              </Link>
            ) : (
              <span className="text-ink-soft">{t(`dashboard.${k}`)}</span>
            )}
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${to ? 'bg-ok-tint text-ok' : 'bg-paper text-ink-faint'}`}>
              {to ? t('dashboard.available') : t('dashboard.soon')}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
