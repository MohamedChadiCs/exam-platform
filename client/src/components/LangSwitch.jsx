import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';
import { LANGS } from '../i18n';

export default function LangSwitch({ className = '' }) {
  const { i18n, t } = useTranslation();
  return (
    <div className={`relative inline-flex items-center gap-1.5 text-sm text-ink-soft ${className}`}>
      <Globe size={15} className="shrink-0 text-ink-faint" aria-hidden="true" />
      <span className="sr-only">{t('common.language')}</span>
      <select
        value={i18n.language}
        onChange={(e) => i18n.changeLanguage(e.target.value)}
        aria-label={t('common.language')}
        className="rounded-lg border border-line bg-white/90 py-1.5 pe-3 ps-2 text-xs font-medium text-ink shadow-sm transition-colors hover:border-mark/40 focus:border-mark focus:outline-none focus:ring-2 focus:ring-mark/20 cursor-pointer"
      >
        {Object.entries(LANGS).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
    </div>
  );
}
