import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import BubbleSheet from '../components/BubbleSheet';
import LangSwitch from '../components/LangSwitch';

export default function AuthLayout({ title, subtitle, children, footer }) {
  const { t } = useTranslation();
  return (
    <div className="grid min-h-screen md:grid-cols-[5fr_6fr]">
      <aside className="hidden flex-col justify-between bg-ink p-10 text-white md:flex">
        <Link to="/login" className="text-lg font-semibold tracking-tight">{t('app.name')}</Link>
        <div>
          <BubbleSheet className="w-full max-w-xs text-white" />
          <p className="mt-8 max-w-xs text-2xl font-light leading-snug">{t('app.tagline')}</p>
        </div>
      </aside>
      <main className="flex flex-col px-6 py-6 sm:px-12">
        <div className="flex items-center justify-between md:justify-end">
          <Link to="/login" className="text-base font-semibold md:hidden">{t('app.name')}</Link>
          <LangSwitch />
        </div>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-ink-soft">{subtitle}</p>}
          <div className="mt-7 space-y-5">{children}</div>
          {footer && <p className="mt-8 text-sm text-ink-soft">{footer}</p>}
        </div>
      </main>
    </div>
  );
}
