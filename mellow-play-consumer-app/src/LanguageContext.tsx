import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { translations, Language, Translations } from './translations';

interface LanguageContextType {
  lang: Language;
  setLang: (lang: Language) => void;
  t: Translations;
}

const LanguageContext = createContext<LanguageContextType | null>(null);

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
  const [lang, setLangState] = useState<Language>(
    (localStorage.getItem('mellow_lang') as Language) || 'th'
  );

  // Kept on <html> because line breaking depends on it. Thai has no spaces
  // between words, so a browser breaks a line wherever it runs out of room —
  // mid-word — unless it applies its Thai dictionary, which it only does for
  // content declared as Thai. Switching to English has to switch this back, or
  // English text inherits Thai breaking rules.
  useEffect(() => {
    document.documentElement.lang = lang === 'en' ? 'en' : 'th';
  }, [lang]);

  const setLang = (newLang: Language) => {
    localStorage.setItem('mellow_lang', newLang);
    setLangState(newLang);
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang, t: translations[lang] }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useTranslation = (): LanguageContextType => {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useTranslation must be used within LanguageProvider');
  return ctx;
};

export const LanguageToggle = () => {
  const { lang, setLang } = useTranslation();
  return (
    <button
      onClick={() => setLang(lang === 'th' ? 'en' : 'th')}
      className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center font-black text-[15px] text-mellow-purple shadow-[inset_0_2px_4px_rgba(0,0,0,0.05)] border border-slate-200 active:scale-95 transition-all"
    >
      {lang === 'th' ? 'EN' : 'ไทย'}
    </button>
  );
};
