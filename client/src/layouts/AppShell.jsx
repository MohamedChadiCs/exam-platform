import { NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LayoutDashboard, Users, Building, HelpCircle, FileText, KeyRound, Play, Award, LogOut, BookOpen, GraduationCap } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import LangSwitch from '../components/LangSwitch';

export default function AppShell() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();

  const nav = [
    { to: '/app', end: true, icon: LayoutDashboard, label: t('dashboard.modulesTitle', 'Dashboard') },
    ...(user.role === 'ADMIN' ? [
      { to: '/app/admin/users', icon: Users, label: t('admin.users', 'Users') },
      { to: '/app/admin/academic', icon: Building, label: t('admin.academic', 'Academic Management') },
    ] : []),
    ...(user.role === 'PROFESSOR' ? [
      { to: '/app/classes', icon: Users, label: t('dashboard.mClasses', 'My Classes') },
      { to: '/app/courses', icon: BookOpen, label: t('dashboard.mCourses', 'Courses') },
      { to: '/app/questions', icon: HelpCircle, label: t('dashboard.mQuestions', 'Question Bank') },
      { to: '/app/exams', icon: FileText, label: t('dashboard.mExams', 'Exams') },
    ] : []),
    ...(user.role === 'STUDENT' ? [
      { to: '/app/student/classes', icon: Users, label: t('dashboard.mMyClasses', 'My Classes') },
      { to: '/app/exams/join', icon: KeyRound, label: t('dashboard.mJoin', 'Join Exam') },
      { to: '/app/exams/take', icon: Play, label: t('dashboard.mTake', 'My Exams') },
      { to: '/app/results', icon: Award, label: t('dashboard.mResults', 'Results') },
    ] : []),
  ];

  const link = ({ isActive }) =>
    `group flex items-center gap-3 rounded-lg px-3.5 py-2.5 text-sm font-medium transition-all duration-150 ${
      isActive
        ? 'bg-mark text-white shadow-sm shadow-mark/25'
        : 'text-ink-soft hover:bg-paper hover:text-ink'
    }`;

  const initials = `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase() || 'U';

  return (
    <div className="min-h-screen bg-paper md:grid md:grid-cols-[16.5rem_1fr]">
      {/* Side Navbar */}
      <aside className="border-b border-line bg-white md:sticky md:top-0 md:flex md:h-screen md:flex-col md:border-b-0 md:border-e">
        <div className="flex items-center justify-between px-6 py-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-mark text-white shadow-sm shadow-mark/30">
              <GraduationCap size={20} />
            </div>
            <div>
              <span className="block text-base font-bold tracking-tight text-ink">{t('app.name')}</span>
              <span className="inline-flex items-center rounded-full bg-mark-tint px-2 py-0.5 text-[10px] font-semibold text-mark">
                {t(`roles.${user.role}`)}
              </span>
            </div>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="flex gap-1.5 overflow-x-auto px-3 pb-3 md:flex-1 md:flex-col md:space-y-1 md:overflow-y-auto md:pb-4" aria-label="Main Navigation">
          <div className="hidden px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-faint md:block">
            Menu
          </div>
          {nav.map(({ to, end, icon: Icon, label }) => (
            <NavLink key={to} to={to} end={end} className={link}>
              <Icon size={18} aria-hidden="true" className="shrink-0 transition-transform duration-150 group-hover:scale-105" />
              <span className="truncate">{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* User Info & Footer */}
        <div className="hidden space-y-3 border-t border-line p-4 md:block">
          <div className="flex items-center justify-between">
            <LangSwitch />
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-line bg-paper/70 p-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-mark-tint text-xs font-bold text-mark">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-semibold text-ink">{user.firstName} {user.lastName}</div>
              <div className="truncate text-[11px] text-ink-soft" title={user.email}>{user.email}</div>
            </div>
          </div>
          <button onClick={logout} className="btn-quiet w-full justify-start text-xs text-pen hover:border-pen/30 hover:bg-pen-tint/40">
            <LogOut size={15} aria-hidden="true" />
            {t('common.logout')}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-line bg-white/90 px-4 py-3 backdrop-blur-md md:hidden">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-mark text-white">
              <GraduationCap size={16} />
            </div>
            <span className="text-sm font-bold tracking-tight text-ink">{t('app.name')}</span>
          </div>
          <div className="flex items-center gap-2">
            <LangSwitch />
            <button onClick={logout} className="btn-quiet !px-2.5 !py-1.5 text-xs text-pen" aria-label={t('common.logout')}>
              <LogOut size={14} aria-hidden="true" />
            </button>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 md:py-8 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
