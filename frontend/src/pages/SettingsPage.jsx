import { useRef, useState } from 'react';
import { Alert, Box, Button, FormControlLabel, Stack, Switch, TextField, Typography } from '@mui/material';
import { api, ApiError } from '../api';
import { useSession } from '../session';
import { describeSync } from '../components/SyncStatus';
import { syncNow, useSyncStatus } from '../sync/engine';
import { disableNotifications, enableNotifications, notificationsOn, notificationsSupported } from '../reminders';
import { exportData, importData, resetData } from '../db/store';

function ChangePassword() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [msg, setMsg] = useState(null);
  const save = async (e) => {
    e.preventDefault();
    try {
      await api.post('/api/auth/password', { currentPassword: current, newPassword: next });
      setCurrent('');
      setNext('');
      setMsg({ severity: 'success', text: 'Password changed.' });
    } catch (err) {
      setMsg({ severity: 'error', text: err instanceof ApiError ? err.message : 'Could not reach the server' });
    }
  };
  return (
    <Box component="form" onSubmit={save} sx={{ mb: 3 }}>
      <Typography variant="h6" sx={{ mb: 1 }}>Change password</Typography>
      <Stack spacing={1.5} sx={{ maxWidth: 360 }}>
        <TextField name="currentPassword" label="Current password" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
        <TextField name="newPassword" label="New password" type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" helperText="At least 8 characters" required />
        {msg && <Alert severity={msg.severity} onClose={() => setMsg(null)}>{msg.text}</Alert>}
        <Button type="submit" variant="outlined" disabled={!current || !next}>Change password</Button>
      </Stack>
    </Box>
  );
}

function Reminders() {
  const [on, setOn] = useState(notificationsOn);
  const [note, setNote] = useState(null);
  const toggle = async (e) => {
    if (!e.target.checked) {
      disableNotifications();
      setOn(false);
      return;
    }
    const result = await enableNotifications();
    setOn(result === 'on');
    setNote(result === 'denied' ? 'Notifications are blocked for this site. Allow them in the browser settings, then try again.' : result === 'unsupported' ? 'This browser does not support notifications.' : null);
  };
  return (
    <Box sx={{ mb: 3 }}>
      <Typography variant="h6" sx={{ mb: 0.5 }}>Reminders</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Reminders and follow-ups that are due always appear at the top of All tasks. Notifications add a system alert when the app is open but in the background or another tab. They cannot wake a closed app.
      </Typography>
      <FormControlLabel control={<Switch checked={on} onChange={toggle} disabled={!notificationsSupported()} />} label="Show notifications" />
      {note && <Alert severity="warning" sx={{ mt: 1 }}>{note}</Alert>}
    </Box>
  );
}

export default function SettingsPage() {
  const { me } = useSession();
  const sync = useSyncStatus();
  const file = useRef();
  const [msg, setMsg] = useState(null);

  const download = () => {
    const url = URL.createObjectURL(new Blob([exportData()], { type: 'application/json' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `todo-backup-${new Date().toISOString().slice(0, 10)}.json` });
    a.click();
    URL.revokeObjectURL(url);
  };
  const upload = async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f || !window.confirm('Replace all data on this device with the backup?')) return;
    try {
      importData(await f.text());
      setMsg({ severity: 'success', text: 'Backup restored.' });
    } catch (err) {
      setMsg({ severity: 'error', text: err.message });
    }
  };
  const reset = () => {
    if (window.confirm('Delete every list and task on this device?')) {
      resetData();
      setMsg({ severity: 'success', text: 'All local data cleared.' });
    }
  };

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 2 }}>Settings</Typography>
      <Alert severity="info" sx={{ mb: 2 }}>
        {me
          ? `Signed in as ${me.email ?? me.username}. Your lists sync with your account and are kept on this device for offline use.`
          : 'Your lists are stored on this device only. Sign in with Google from the top bar to sync and share them.'}
      </Alert>
      {me && (
        <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 3 }}>
          <Typography color="text.secondary" sx={{ flex: 1 }}>{describeSync(sync)}</Typography>
          <Button variant="outlined" onClick={syncNow} disabled={sync.state === 'syncing'}>Sync now</Button>
        </Stack>
      )}
      {msg && <Alert severity={msg.severity} sx={{ mb: 2 }} onClose={() => setMsg(null)}>{msg.text}</Alert>}
      <Reminders />
      {me?.passwordLogin && <ChangePassword />}
      <Typography variant="h6" sx={{ mb: 1 }}>Backup</Typography>
      <Stack direction="row" spacing={1} sx={{ mb: 3 }}>
        <Button variant="outlined" onClick={download}>Export JSON</Button>
        <Button variant="outlined" onClick={() => file.current.click()}>Import JSON</Button>
        <input ref={file} type="file" accept="application/json" hidden onChange={upload} />
      </Stack>
      <Button color="error" variant="outlined" onClick={reset}>Delete all local data</Button>
    </Box>
  );
}
