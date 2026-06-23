import { createContext, useContext, useState, useEffect, useLayoutEffect, type ReactNode } from 'react';
import { applyMobileThemeVars } from '@/mobile/theme';

interface ThemeContextValue {
  dark: boolean;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = 'luera-theme';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [dark, setDark] = useState<boolean>(() => {
    try { return localStorage.getItem(STORAGE_KEY) === 'dark'; } catch { return false; }
  });

  // Mobil tema değişkenlerini :root'a uygula (flash olmaması için layout-effect).
  // Portallar (BottomSheet → document.body) da :root'tan miras alır.
  useLayoutEffect(() => { applyMobileThemeVars(dark); }, [dark]);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, dark ? 'dark' : 'light'); } catch { /* yoksay */ }
  }, [dark]);

  const toggle = () => setDark(d => !d);

  return (
    <ThemeContext.Provider value={{ dark, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme, <ThemeProvider> içinde kullanılmalıdır');
  return ctx;
}
