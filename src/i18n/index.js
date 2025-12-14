import { createI18n } from 'vue-i18n';
import { LANGUAGES, STORAGE_KEYS } from '../utils/constants.js';

// Import locale messages
import zhTW from './locales/zh-TW.json';
import zhCN from './locales/zh-CN.json';
import en from './locales/en.json';
import ja from './locales/ja.json';

const messages = {
  'zh-TW': zhTW,
  'zh-CN': zhCN,
  'en': en,
  'ja': ja
};

// Get browser language or saved preference
const getBrowserLanguage = () => {
  const saved = localStorage.getItem(STORAGE_KEYS.LANGUAGE);
  if (saved && Object.values(LANGUAGES).includes(saved)) {
    return saved;
  }
  
  const browserLang = navigator.language || navigator.userLanguage;
  
  // Match exact locale
  if (Object.values(LANGUAGES).includes(browserLang)) {
    return browserLang;
  }
  
  // Match language prefix (e.g., 'en-US' -> 'en')
  const langPrefix = browserLang.split('-')[0];
  const matched = Object.values(LANGUAGES).find(lang => lang.startsWith(langPrefix));
  
  return matched || LANGUAGES.ZH_TW; // Default to Traditional Chinese
};

export const i18n = createI18n({
  legacy: false,
  locale: getBrowserLanguage(),
  fallbackLocale: LANGUAGES.ZH_TW,
  messages,
  globalInjection: true
});

export default i18n;
