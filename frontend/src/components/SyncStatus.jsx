import { useEffect } from 'react';
import { Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from '@mui/material';
import CloudDoneIcon from '@mui/icons-material/CloudDone';
import CloudOffIcon from '@mui/icons-material/CloudOff';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { useSession } from '../session';
import { adoptAccount, startSync, stopSync, syncNow, useSyncStatus } from '../sync/engine';

/** Starts/stops the sync engine with the session. Renders nothing. */
export function SyncRunner() {
  const { me, refresh } = useSession();
  useEffect(() => {
    if (me) startSync(me, { unauthorized: refresh });
    else stopSync();
    return stopSync;
  }, [me?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

export function describeSync(s) {
  switch (s.state) {
    case 'syncing': return 'Syncing…';
    case 'offline': return 'Offline: changes are saved on this device';
    case 'error': return `Sync problem: ${s.error ?? 'unknown error'}`;
    case 'paused': return 'Sync paused';
    default: return s.lastSyncAt ? `Synced at ${new Date(s.lastSyncAt).toLocaleTimeString()}` : 'Up to date';
  }
}

export function SyncChip() {
  const { me } = useSession();
  const s = useSyncStatus();
  if (!me) return null;
  const icon = s.state === 'syncing' ? <CircularProgress size={14} color="inherit" />
    : s.state === 'offline' ? <CloudOffIcon />
    : s.state === 'error' || s.state === 'paused' ? <ErrorOutlineIcon />
    : <CloudDoneIcon />;
  return (
    <Chip
      size="small" icon={icon} label={s.state === 'syncing' ? 'Syncing' : s.state === 'offline' ? 'Offline' : s.state === 'idle' ? 'Synced' : 'Problem'}
      title={describeSync(s)} onClick={syncNow} aria-label={describeSync(s)}
      sx={{ mr: 1, color: 'inherit', bgcolor: 'rgba(255,255,255,0.16)', '& .MuiChip-icon': { color: 'inherit' } }}
    />
  );
}

/** Shown when this device holds another account's data. */
export function AccountSwitchDialog() {
  const { me, refresh } = useSession();
  const s = useSyncStatus();
  const opts = { unauthorized: refresh };
  return (
    <Dialog open={!!me && s.state === 'paused'}>
      <DialogTitle>Lists from another account</DialogTitle>
      <DialogContent>
        <DialogContentText>
          This device holds lists that were synced with a different account. Add them to {me?.email ?? me?.username}, or start with
          an empty device? Starting clean only clears this device; the other account keeps its data.
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => adoptAccount(me, false, opts)}>Start clean</Button>
        <Button variant="contained" onClick={() => adoptAccount(me, true, opts)}>Add to this account</Button>
      </DialogActions>
    </Dialog>
  );
}
