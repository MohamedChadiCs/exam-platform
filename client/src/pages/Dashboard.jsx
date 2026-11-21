import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Users, Building, BookOpen, HelpCircle, FileText, KeyRound, Play, Award,
  ArrowRight, Sparkles, CheckCircle2, Clock
} from 'lucide-react';
import { useAuth } from '../lib/AuthContext';

const MODULES = {
  ADMIN: [
    { k: 'mUsers', to: '/app/admin/users', icon: Users, desc: 'usersSubtitle' },
    { k: 'mAcademic', to: '/app/admin/academic', icon: Building, desc: 'academicSubtitle' },
  ],
  PROFESSOR: [
    { k: 'mClasses', to: '/app/classes', icon: Users },
    { k: 'mCourses', to: '/app/courses', icon: BookOpen },
    { k: 'mQuestions', to: '/app/questions', icon: HelpCircle },
    { k: 'mExams', to: '/app/exams', icon: FileText },
    { k: 'mCodes', icon: KeyRound },
  ],
  STUDENT: [
    { k: 'mMyClasses', to: '/app/student/classes', icon: Users },
    { k: 'mJoin', to: '/app/exams/join', icon: KeyRound },
    { k: 'mTake', to: '/app/exams/take', icon: Play },
    { k: 'mResults', to: '/app/results', icon: Award },
  ],
};

export default function Dashboard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const modules = MODULES[user.role] || [];

  return (
    <div className="space-y-8">
      {/* Welcome Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-line bg-gradient-to-br from-white via-white to-mark-tint/30 p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 rounded-full bg-mark-tint px-3 py-1 text-xs font-semibold text-mark">
              <Sparkles size={13} />
              <span>{t(`roles.${user.role}`)}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-ink">
              {t('dashboard.welcome', { name: user.firstName })}
            </h1>
            <p className="text-sm text-ink-soft max-w-xl">
              {t(`dashboard.subtitle${user.role}`)}
            </p>
          </div>
        </div>
      </div>

      {/* Modules Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold tracking-tight text-ink">
            {t('dashboard.modulesTitle')}
          </h2>
          <span className="text-xs font-medium text-ink-faint">
            {modules.length} {t('common.all').toLowerCase()}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {modules.map(({ k, to, icon: Icon = FileText }) => {
            const isAvailable = Boolean(to);
            const CardWrapper = to ? Link : 'div';

            return (
              <CardWrapper
                key={k}
                to={to}
                className={`group relative flex flex-col justify-between rounded-xl border border-line bg-white p-5 shadow-sm transition-all duration-200 ${
                  isAvailable
                    ? 'hover:-translate-y-1 hover:border-mark/40 hover:shadow-md'
                    : 'opacity-70 bg-paper/50'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div
                      className={`flex h-11 w-11 items-center justify-center rounded-xl transition-colors duration-150 ${
                        isAvailable
                          ? 'bg-mark-tint text-mark group-hover:bg-mark group-hover:text-white'
                          : 'bg-paper text-ink-faint'
                      }`}
                    >
                      <Icon size={20} />
                    </div>
                    <span
                      className={`badge ${
                        isAvailable
                          ? 'bg-ok-tint text-ok border border-ok/20'
                          : 'bg-paper text-ink-faint border border-line'
                      }`}
                    >
                      {isAvailable ? (
                        <>
                          <CheckCircle2 size={12} />
                          <span>{t('dashboard.available')}</span>
                        </>
                      ) : (
                        <>
                          <Clock size={12} />
                          <span>{t('dashboard.soon')}</span>
                        </>
                      )}
                    </span>
                  </div>

                  <h3
                    className={`mt-4 text-base font-semibold tracking-tight ${
                      isAvailable ? 'text-ink group-hover:text-mark' : 'text-ink-soft'
                    }`}
                  >
                    {t(`dashboard.${k}`)}
                  </h3>
                </div>

                <div className="mt-5 flex items-center justify-end border-t border-line/60 pt-3 text-xs font-medium">
                  {isAvailable ? (
                    <span className="inline-flex items-center gap-1.5 text-mark group-hover:translate-x-0.5 transition-transform">
                      <span>{t('common.open', 'Open')}</span>
                      <ArrowRight size={14} />
                    </span>
                  ) : (
                    <span className="text-ink-faint">{t('dashboard.soon')}</span>
                  )}
                </div>
              </CardWrapper>
            );
          })}
        </div>
      </div>
    </div>
  );
}
