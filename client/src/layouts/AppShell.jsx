import { NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LayoutDashboard, Users, Building, HelpCircle, FileText, KeyRound, Play, Award, LogOut, BookOpen } from 'lucide-react';
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
    `flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
      isActive ? 'bg-mark-tint font-medium text-mark' : 'text-ink-soft hover:bg-paper hover:text-ink'
    }`;

  return (
    <div className="min-h-screen md:grid md:grid-cols-[16rem_1fr]">
      {/* Side Navbar */}
      <aside className="border-b border-line bg-white md:flex md:flex-col md:border-b-0 md:border-e">
        <div className="flex items-center justify-between px-5 py-5 md:block">
          <span className="text-base font-bold tracking-tight text-ink">{t('app.name')}</span>
          <div className="text-xs font-medium text-mark md:mt-1 md:block">{t(`roles.${user.role}`)}</div>
        </div>

        {/* Navigation Items */}
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-1 md:flex-col md:pb-0" aria-label="Main Navigation">
          <div className="hidden px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-faint md:block">
            Menu
          </div>
          {nav.map(({ to, end, icon: Icon, label }) => (
            <NavLink key={to} to={to} end={end} className={link}>
              <Icon size={18} aria-hidden="true" className="shrink-0" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* User Info & Footer */}
        <div className="hidden space-y-3 border-t border-line p-4 md:block">
          <LangSwitch />
          <div className="rounded-md bg-paper p-2.5">
            <div className="text-xs font-semibold text-ink">{user.firstName} {user.lastName}</div>
            <div className="truncate text-[11px] text-ink-soft" title={user.email}>{user.email}</div>
          </div>
          <button onClick={logout} className="btn-quiet w-full justify-start text-xs">
            <LogOut size={15} aria-hidden="true" />
            {t('common.logout')}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-col">
        <header className="flex items-center justify-end gap-3 border-b border-line bg-white px-6 py-3 md:hidden">
          <LangSwitch />
          <button onClick={logout} className="btn-quiet text-xs">
            <LogOut size={15} aria-hidden="true" />
            {t('common.logout')}
          </button>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
