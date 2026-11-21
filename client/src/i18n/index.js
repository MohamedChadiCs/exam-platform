import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';
import fr from './fr.json';
import ar from './ar.json';

export const LANGS = { fr: 'Français', ar: 'العربية', en: 'English' };
const saved = localStorage.getItem('lang');
const initial = saved in LANGS ? saved : 'fr';

export function applyDirection(lang) {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
}

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, fr: { translation: fr }, ar: { translation: ar } },
  lng: initial, fallbackLng: 'en', interpolation: { escapeValue: false }, // React already escapes
});
applyDirection(initial);
i18n.on('languageChanged', (l) => { localStorage.setItem('lang', l); applyDirection(l); });

export default i18n;
