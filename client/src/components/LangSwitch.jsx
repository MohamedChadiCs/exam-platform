import { useTranslation } from 'react-i18next';
import { Languages } from 'lucide-react';
import { LANGS } from '../i18n';

export default function LangSwitch({ className = '' }) {
  const { i18n, t } = useTranslation();
  return (
    <label className={`inline-flex items-center gap-2 text-sm text-ink-soft ${className}`}>
      <Languages size={16} aria-hidden="true" />
      <span className="sr-only">{t('common.language')}</span>
      <select value={i18n.language} onChange={(e) => i18n.changeLanguage(e.target.value)}
        className="rounded-md border border-line bg-white px-2 py-1 text-sm text-ink">
        {Object.entries(LANGS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
    </label>
  );
}
