'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { Toaster } from 'sonner';
import type { Lang } from '@/lib/i18n';

type Theme = 'light' | 'dark';

type ThemeCtx = { theme: Theme; setTheme: (t: Theme) => void; toggleTheme: () => void };
const ThemeContext = createContext<ThemeCtx | null>(null);

type LangCtx = { lang: Lang; setLang: (l: Lang) => void; dir: 'ltr' | 'rtl' };
const LangContext = createContext<LangCtx | null>(null);

const THEME_KEY = 'acb.theme';
const LANG_KEY  = 'acb.lang';

export function Providers({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('dark');
  const [lang, setLangState]   = useState<Lang>('en');
  const [ready, setReady]      = useState(false);

  // Read persisted preferences on mount
  useEffect(() => {
    try {
      const t = localStorage.getItem(THEME_KEY) as Theme | null;
      const l = localStorage.getItem(LANG_KEY)  as Lang | null;
      if (t === 'light' || t === 'dark') setThemeState(t);
      else if (window.matchMedia('(prefers-color-scheme: dark)').matches) setThemeState('dark');
      else setThemeState('light');
      if (l === 'en' || l === 'ar') setLangState(l);
    } catch {/* ignore */}
    setReady(true);
  }, []);

  // Apply theme to <html>
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    root.style.colorScheme = theme;
  }, [theme]);

  // Apply lang/dir to <html>
  useEffect(() => {
    const root = document.documentElement;
    root.lang = lang;
    root.dir  = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    try { localStorage.setItem(THEME_KEY, t); } catch {/* ignore */}
  }, []);
  const toggleTheme = useCallback(() => setTheme(theme === 'dark' ? 'light' : 'dark'), [theme, setTheme]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try { localStorage.setItem(LANG_KEY, l); } catch {/* ignore */}
  }, []);

  const themeValue = useMemo(() => ({ theme, setTheme, toggleTheme }), [theme, setTheme, toggleTheme]);
  const langValue  = useMemo(() => ({ lang, setLang, dir: (lang === 'ar' ? 'rtl' : 'ltr') as 'ltr' | 'rtl' }), [lang, setLang]);

  return (
    <ThemeContext.Provider value={themeValue}>
      <LangContext.Provider value={langValue}>
        <div data-ready={ready ? 'true' : 'false'} className="contents">
          {children}
        </div>
        <Toaster
          position="bottom-right"
          theme={theme}
          richColors
          closeButton
          toastOptions={{ style: { fontFamily: 'inherit' } }}
        />
      </LangContext.Provider>
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const v = useContext(ThemeContext);
  if (!v) throw new Error('useTheme must be used inside <Providers>');
  return v;
}
export function useLang() {
  const v = useContext(LangContext);
  if (!v) throw new Error('useLang must be used inside <Providers>');
  return v;
}
