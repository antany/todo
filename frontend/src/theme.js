import { alpha, createTheme } from '@mui/material/styles';

// Categorical chart colours (validated for colour-blind separation); the last one is the neutral "other".
export const chartColors = {
  light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#9a9a94'],
  dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#6f6f6a'],
};

/** Colours the app bar, page background and theme-color meta tag share, per mode. */
export const brand = {
  light: { bar: ['#3949ab', '#00acc1'], bg: '#eef2fa', glow: ['#c5cdfa', '#bdeff5'] },
  dark: { bar: ['#1a237e', '#006978'], bg: '#0a0f1c', glow: ['#1f2a6b', '#0b4650'] },
};

/** A cool Material theme: indigo primary, cyan secondary, with gradients, soft glows and glassy surfaces. */
export function buildTheme(mode) {
  const dark = mode === 'dark';
  const b = brand[mode];
  const primary = dark ? '#9fa8ff' : '#3949ab';
  const line = alpha(primary, dark ? 0.2 : 0.14);
  return createTheme({
    palette: {
      mode,
      primary: { main: primary },
      secondary: { main: dark ? '#4dd0e1' : '#00acc1' },
      background: dark ? { default: b.bg, paper: '#141b30' } : { default: b.bg, paper: '#ffffff' },
      divider: line,
    },
    shape: { borderRadius: 16 },
    typography: {
      fontFamily: 'Roboto, system-ui, -apple-system, "Segoe UI", sans-serif',
      h5: { fontWeight: 700, letterSpacing: '-0.01em' },
      h6: { fontWeight: 700, letterSpacing: '-0.01em' },
      subtitle1: { fontWeight: 600 },
      button: { textTransform: 'none', fontWeight: 600 },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          html: { scrollPaddingTop: 72, scrollPaddingBottom: 160, colorScheme: mode },
          body: {
            minHeight: '100vh',
            backgroundAttachment: 'fixed',
            backgroundImage: `radial-gradient(900px 500px at 0% -10%, ${alpha(b.glow[0], dark ? 0.55 : 0.8)}, transparent 60%),
              radial-gradient(800px 500px at 100% 0%, ${alpha(b.glow[1], dark ? 0.5 : 0.7)}, transparent 55%)`,
            backgroundRepeat: 'no-repeat',
          },
          '*::selection': { background: alpha(primary, 0.3) },
          '@media (prefers-reduced-motion: reduce)': { '*': { transitionDuration: '0.01ms !important', animationDuration: '0.01ms !important' } },
        },
      },
      MuiAppBar: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: {
            backgroundImage: `linear-gradient(110deg, ${b.bar[0]}, ${b.bar[1]})`,
            color: '#fff',
            boxShadow: `0 6px 24px ${alpha(b.bar[0], dark ? 0.5 : 0.28)}`,
          },
        },
      },
      MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
      MuiCard: {
        defaultProps: { variant: 'outlined' },
        styleOverrides: {
          root: {
            borderColor: line,
            backgroundColor: alpha(dark ? '#141b30' : '#ffffff', dark ? 0.78 : 0.82),
            backdropFilter: 'blur(10px)',
            transition: 'transform .15s ease, box-shadow .15s ease, border-color .15s ease',
            '&:hover': { borderColor: alpha(primary, 0.45), boxShadow: `0 8px 24px ${alpha(primary, dark ? 0.22 : 0.14)}` },
          },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            backgroundColor: alpha(dark ? '#0d1325' : '#ffffff', dark ? 0.85 : 0.75),
            backdropFilter: 'blur(14px)',
            borderRight: `1px solid ${line}`,
          },
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: 12,
            transition: 'background-color .15s ease',
            '&.Mui-selected': {
              backgroundImage: `linear-gradient(90deg, ${alpha(primary, dark ? 0.28 : 0.16)}, ${alpha(dark ? '#4dd0e1' : '#00acc1', dark ? 0.14 : 0.1)})`,
              fontWeight: 600,
            },
          },
        },
      },
      MuiBottomNavigation: {
        styleOverrides: { root: { backgroundColor: 'transparent', height: 64 } },
      },
      MuiBottomNavigationAction: {
        styleOverrides: {
          root: {
            transition: 'color .15s ease',
            '&.Mui-selected': { color: dark ? '#4dd0e1' : '#3949ab' },
            '&.Mui-selected .MuiBottomNavigationAction-label': { fontWeight: 700 },
            '&.Mui-selected svg': { transform: 'translateY(-1px) scale(1.12)' },
            '& svg': { transition: 'transform .15s ease' },
          },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          containedPrimary: {
            backgroundImage: `linear-gradient(110deg, ${dark ? '#7986ff' : '#3949ab'}, ${dark ? '#26c6da' : '#00acc1'})`,
            color: dark ? '#0a0f1c' : '#fff',
            '&:hover': { filter: 'brightness(1.08)' },
          },
        },
      },
      MuiFab: {
        styleOverrides: {
          primary: {
            backgroundImage: `linear-gradient(135deg, ${dark ? '#7986ff' : '#3949ab'}, ${dark ? '#26c6da' : '#00acc1'})`,
            color: dark ? '#0a0f1c' : '#fff',
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: { borderRadius: 999, fontWeight: 500 },
          outlined: { borderColor: line },
          filledPrimary: { backgroundImage: `linear-gradient(110deg, ${primary}, ${dark ? '#26c6da' : '#00acc1'})`, color: dark ? '#0a0f1c' : '#fff' },
        },
      },
      MuiCheckbox: { styleOverrides: { root: { borderRadius: 10 } } },
      MuiTextField: { defaultProps: { size: 'small', fullWidth: true } },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            backgroundColor: alpha(dark ? '#0d1325' : '#ffffff', dark ? 0.6 : 0.7),
            '&.Mui-focused': { boxShadow: `0 0 0 3px ${alpha(primary, 0.22)}` },
          },
        },
      },
      MuiDialog: { styleOverrides: { paper: { borderRadius: 20, border: `1px solid ${line}` } } },
      MuiAccordion: {
        defaultProps: { disableGutters: true, elevation: 0 },
        styleOverrides: { root: { '&:before': { display: 'none' }, border: `1px solid ${line}` } },
      },
      MuiSnackbarContent: { styleOverrides: { root: { borderRadius: 14 } } },
      MuiTabs: { styleOverrides: { indicator: { height: 3, borderRadius: 3, backgroundImage: `linear-gradient(90deg, ${primary}, ${dark ? '#4dd0e1' : '#00acc1'})` } } },
    },
  });
}
