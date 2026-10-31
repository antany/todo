import {
  Avatar, Button, IconButton, ListItemText as MenuText, Menu, MenuItem,
  AppBar, BottomNavigation, BottomNavigationAction, Box, Container, Divider, Drawer, List, ListItemButton,
  ListItemIcon, ListItemText, Paper, Toolbar, Tooltip, Typography, useMediaQuery, useTheme,
} from '@mui/material';
import ListAltIcon from '@mui/icons-material/ListAlt';
import ChecklistIcon from '@mui/icons-material/Checklist';
import TodayIcon from '@mui/icons-material/Today';
import UpcomingIcon from '@mui/icons-material/EventNote';
import NotificationsIcon from '@mui/icons-material/NotificationsActive';
import SettingsIcon from '@mui/icons-material/Settings';
import BrightnessAutoIcon from '@mui/icons-material/BrightnessAuto';
import LightModeIcon from '@mui/icons-material/LightMode';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import { useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import ListsPage from './pages/ListsPage';
import ListPage from './pages/ListPage';
import AllTasksPage from './pages/AllTasksPage';
import SmartPage from './pages/SmartPage';
import SettingsPage from './pages/SettingsPage';
import LoginPage from './pages/LoginPage';
import { useSession } from './session';
import { AccountSwitchDialog, SyncChip, SyncRunner } from './components/SyncStatus';
import { liveLists, useStore } from './db/store';
import { ToastProvider } from './toast';
import { useThemeMode } from './themeMode';
import InvitationsButton from './components/Invitations';
import { useReminderAnnouncer } from './reminders';

const NAV = [
  { path: '/all', label: 'All tasks', icon: <ChecklistIcon /> },
  { path: '/lists', label: 'Lists', icon: <ListAltIcon /> },
  { path: '/today', label: 'Today', icon: <TodayIcon /> },
  { path: '/upcoming', label: 'Upcoming', icon: <UpcomingIcon /> },
  { path: '/follow-up', label: 'Follow-up', icon: <NotificationsIcon /> },
  { path: '/settings', label: 'Settings', icon: <SettingsIcon /> },
];
const DRAWER = 248;

const MODE_ICON = { system: <BrightnessAutoIcon />, light: <LightModeIcon />, dark: <DarkModeIcon /> };

function ThemeToggle() {
  const { pref, cycle } = useThemeMode();
  return (
    <Tooltip title={`Theme: ${pref} (tap to change)`}>
      <IconButton color="inherit" aria-label={`Theme: ${pref}`} onClick={cycle}>{MODE_ICON[pref]}</IconButton>
    </Tooltip>
  );
}

function AccountMenu() {
  const { me, signOut } = useSession();
  const nav = useNavigate();
  const [anchor, setAnchor] = useState(null);
  if (!me) return <Button color="inherit" onClick={() => nav('/login')}>Sign in</Button>;
  return (
    <>
      <IconButton aria-label="Account" onClick={(e) => setAnchor(e.currentTarget)} sx={{ p: 0.5 }}>
        <Avatar sx={{ width: 32, height: 32, bgcolor: 'secondary.main' }}>{me.displayName.charAt(0).toUpperCase()}</Avatar>
      </IconButton>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
        <MenuItem disabled sx={{ opacity: '1 !important' }}>
          <MenuText primary={me.displayName} secondary={me.email ?? 'Username account'} />
        </MenuItem>
        <MenuItem onClick={() => { setAnchor(null); signOut(); }}>Sign out</MenuItem>
      </Menu>
    </>
  );
}

export default function App() {
  const theme = useTheme();
  const wide = useMediaQuery(theme.breakpoints.up('md'));
  const { pathname } = useLocation();
  const nav = useNavigate();
  const state = useStore();
  useReminderAnnouncer();
  const current = NAV.find((n) => pathname.startsWith(n.path))?.path ?? '/all';

  return (
    <ToastProvider>
      <SyncRunner />
      <AccountSwitchDialog />
      <AppBar position="sticky" color="primary" sx={{ zIndex: (t) => t.zIndex.drawer + 1 }}>
        <Toolbar>
          <Typography variant="h6" sx={{ flex: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
            <ChecklistIcon /> Todo
          </Typography>
          <SyncChip />
          <InvitationsButton />
          <ThemeToggle />
          <AccountMenu />
        </Toolbar>
      </AppBar>

      {wide && (
        <Drawer variant="permanent" sx={{ width: DRAWER, '& .MuiDrawer-paper': { width: DRAWER, boxSizing: 'border-box' } }}>
          <Toolbar />
          <List>
            {NAV.map((n) => (
              <ListItemButton key={n.path} selected={current === n.path && !pathname.startsWith('/lists/')} onClick={() => nav(n.path)}>
                <ListItemIcon>{n.icon}</ListItemIcon>
                <ListItemText primary={n.label} />
              </ListItemButton>
            ))}
          </List>
          <Divider />
          <List dense>
            {liveLists(state).map((l) => (
              <ListItemButton key={l.id} selected={pathname === `/lists/${l.id}`} onClick={() => nav(`/lists/${l.id}`)}>
                <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: l.color, mr: 2 }} />
                <ListItemText primary={l.name} slotProps={{ primary: { noWrap: true } }} />
              </ListItemButton>
            ))}
          </List>
        </Drawer>
      )}

      <Box sx={{ ml: wide ? `${DRAWER}px` : 0, pb: wide ? 4 : 14 }}>
        <Container maxWidth="md" sx={{ py: 2 }}>
          <Routes>
            <Route path="/" element={<Navigate to="/all" replace />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/lists" element={<ListsPage />} />
            <Route path="/lists/:id" element={<ListPage />} />
            <Route path="/all" element={<AllTasksPage />} />
            <Route path="/today" element={<SmartPage mode="today" />} />
            <Route path="/upcoming" element={<SmartPage mode="upcoming" />} />
            <Route path="/follow-up" element={<SmartPage mode="followup" />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/all" replace />} />
          </Routes>
        </Container>
      </Box>

      {!wide && (
        <Paper
          elevation={0}
          sx={{
            position: 'fixed', left: 8, right: 8, bottom: 'calc(8px + env(safe-area-inset-bottom))', borderRadius: 5, overflow: 'hidden',
            border: 1, borderColor: 'divider', backdropFilter: 'blur(14px)',
            bgcolor: (t) => (t.palette.mode === 'dark' ? 'rgba(13,19,37,.85)' : 'rgba(255,255,255,.85)'),
            boxShadow: (t) => `0 8px 28px ${t.palette.mode === 'dark' ? 'rgba(0,0,0,.5)' : 'rgba(57,73,171,.22)'}`,
          }}
        >
          <BottomNavigation showLabels value={current} onChange={(_, v) => nav(v)}>
            {NAV.map((n) => <BottomNavigationAction key={n.path} value={n.path} label={n.label} icon={n.icon} sx={{ minWidth: 0 }} />)}
          </BottomNavigation>
        </Paper>
      )}
    </ToastProvider>
  );
}
