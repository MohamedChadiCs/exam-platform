import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { GraduationCap } from 'lucide-react';
import BubbleSheet from '../components/BubbleSheet';
import LangSwitch from '../components/LangSwitch';

export default function AuthLayout({ title, subtitle, children, footer }) {
  const { t } = useTranslation();
  return (
    <div className="grid min-h-screen md:grid-cols-[5fr_6fr]">
      {/* Visual Side Banner */}
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-ink via-[#1a294b] to-[#101b33] p-10 lg:p-14 text-white md:flex">
        <div className="relative z-10 flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-mark text-white shadow-md shadow-mark/40">
            <GraduationCap size={22} />
          </div>
          <Link to="/login" className="text-xl font-bold tracking-tight text-white hover:opacity-90 transition-opacity">
            {t('app.name')}
          </Link>
        </div>

        <div className="relative z-10 max-w-sm">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md shadow-2xl">
            <BubbleSheet className="w-full text-white" />
          </div>
          <p className="mt-8 text-2xl lg:text-3xl font-light leading-snug tracking-tight text-white/95">
            {t('app.tagline')}
          </p>
        </div>

        <div className="relative z-10 text-xs text-white/40">
          © {new Date().getFullYear()} {t('app.name')}
        </div>

        {/* Ambient glow decoration */}
        <div className="pointer-events-none absolute -bottom-24 -left-24 h-96 w-96 rounded-full bg-mark/20 blur-3xl" />
        <div className="pointer-events-none absolute -top-24 -right-24 h-96 w-96 rounded-full bg-mark/15 blur-3xl" />
      </aside>

      {/* Main Form Content */}
      <main className="flex flex-col bg-paper px-6 py-6 sm:px-12 md:px-14 lg:px-16">
        <div className="flex items-center justify-between md:justify-end">
          <Link to="/login" className="flex items-center gap-2 text-base font-bold tracking-tight text-ink md:hidden">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-mark text-white">
              <GraduationCap size={16} />
            </div>
            <span>{t('app.name')}</span>
          </Link>
          <LangSwitch />
        </div>

        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10 sm:py-12">
          <div className="rounded-2xl border border-line bg-white p-7 sm:p-9 shadow-sm">
            <h1 className="text-2xl font-bold tracking-tight text-ink">{title}</h1>
            {subtitle && <p className="mt-1.5 text-sm text-ink-soft leading-relaxed">{subtitle}</p>}
            <div className="mt-6 space-y-4">{children}</div>
          </div>
          {footer && <p className="mt-6 text-center text-sm text-ink-soft">{footer}</p>}
        </div>
      </main>
    </div>
  );
}
