import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { CssBaseline, ThemeProvider, useMediaQuery } from '@mui/material';
import { brand, buildTheme } from './theme';

const KEY = 'todo.theme';
const ORDER = ['system', 'light', 'dark'];
const Ctx = createContext({ pref: 'system', mode: 'light', cycle: () => {} });

function load() {
  try {
    const v = localStorage.getItem(KEY);
    return ORDER.includes(v) ? v : 'system';
  } catch {
    return 'system';
  }
}

/** Theme preference (system / light / dark), remembered per device; "system" follows the OS. */
export function ThemeModeProvider({ children }) {
  const osDark = useMediaQuery('(prefers-color-scheme: dark)');
  const [pref, setPref] = useState(load);
  const mode = pref === 'system' ? (osDark ? 'dark' : 'light') : pref;
  const theme = useMemo(() => buildTheme(mode), [mode]);

  const cycle = useCallback(() => {
    setPref((p) => {
      const next = ORDER[(ORDER.indexOf(p) + 1) % ORDER.length];
      try { localStorage.setItem(KEY, next); } catch { /* private mode: preference lasts for this visit */ }
      return next;
    });
  }, []);

  // Keep the browser / installed-app chrome in step with the app bar.
  useEffect(() => {
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', brand[mode].bar[0]);
  }, [mode]);

  const value = useMemo(() => ({ pref, mode, cycle }), [pref, mode, cycle]);
  return (
    <Ctx.Provider value={value}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </Ctx.Provider>
  );
}

export const useThemeMode = () => useContext(Ctx);
