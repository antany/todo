import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, List, ListItem,
  ListItemText, Stack, TextField, Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { api } from '../api';
import { useSession } from '../session';
import { syncNow } from '../sync/engine';
import { isOwner, useStore } from '../db/store';

const ROLE_LABEL = { EDITOR: 'Can edit', VIEWER: 'Can view', OWNER: 'Owner' };

/**
 * Members of one list. The owner invites by Google email or by username and changes roles; an invited person
 * sees nothing until they accept. Anyone else can see who the list is shared with and leave it.
 */
export default function ShareDialog({ open, list, onClose }) {
  const { me } = useSession();
  const owner = isOwner(useStore(), list.id);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [identity, setIdentity] = useState('');
  const [role, setRole] = useState('EDITOR');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      setData(await api.get(`/api/lists/${list.id}/members`));
    } catch (e) {
      setData(null);
      setError(e.status === 404 ? 'This list has not reached the server yet. Check your connection and try again.' : e.message);
    }
  }, [list.id]);

  useEffect(() => {
    if (!open || !me) return;
    setIdentity('');
    setData(null);
    // A brand-new list only exists locally until the first sync.
    syncNow().finally(load);
  }, [open, me, load]);

  const act = async (fn) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const invite = () => identity.trim() && act(async () => {
    await api.post(`/api/lists/${list.id}/members`, { identity: identity.trim(), role });
    setIdentity('');
  });
  const leave = async () => {
    setBusy(true);
    try {
      await api.del(`/api/lists/${list.id}/members/${me.id}`);
      await syncNow(); // drops the list locally
      onClose();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center' }}>
        <Box sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>Share “{list.name}”</Box>
        <IconButton aria-label="Close" onClick={onClose} edge="end"><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent>
        {!me ? (
          <Alert severity="info">Sign in to share lists. Your lists stay on this device until you do.</Alert>
        ) : (
          <>
            {error && <Alert severity="error" sx={{ mb: 1.5 }}>{error}</Alert>}
            {!data && !error && <Box sx={{ textAlign: 'center', py: 3 }}><CircularProgress size={28} /></Box>}
            {owner && data && (
              <Stack spacing={1} sx={{ mb: 2, mt: 0.5 }}>
                <TextField
                  name="invite" label="Email or username" value={identity} onChange={(e) => setIdentity(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && invite()} autoComplete="off" autoCapitalize="none"
                  helperText="They must accept before they can see the list."
                />
                <Stack direction="row" spacing={1}>
                  <TextField select name="inviteRole" value={role} onChange={(e) => setRole(e.target.value)} slotProps={{ select: { native: true } }}>
                    <option value="EDITOR">Can edit</option>
                    <option value="VIEWER">Can view</option>
                  </TextField>
                  <Button variant="contained" onClick={invite} disabled={busy || !identity.trim()} sx={{ whiteSpace: 'nowrap' }}>Invite</Button>
                </Stack>
              </Stack>
            )}
            {data && (
              <List dense disablePadding>
                <Person m={data.owner} you={data.owner.userId === me.id} trailing={<Chip size="small" label="Owner" />} />
                {data.members.map((m) => (
                  <Person
                    key={m.userId} m={m} you={m.userId === me.id}
                    trailing={owner ? (
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <TextField
                          select size="small" name={`role-${m.userId}`} value={m.role} disabled={busy} sx={{ width: 112 }}
                          onChange={(e) => act(() => api.patch(`/api/lists/${list.id}/members/${m.userId}`, { role: e.target.value }))}
                          slotProps={{ select: { native: true } }}
                        >
                          <option value="EDITOR">Can edit</option>
                          <option value="VIEWER">Can view</option>
                        </TextField>
                        <IconButton size="small" aria-label={`Remove ${m.name}`} disabled={busy} onClick={() => act(() => api.del(`/api/lists/${list.id}/members/${m.userId}`))}>
                          <CloseIcon fontSize="small" />
                        </IconButton>
                      </Stack>
                    ) : <Chip size="small" variant="outlined" label={ROLE_LABEL[m.role]} />}
                  />
                ))}
              </List>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions>
        {me && !owner && data && <Button color="error" onClick={leave} disabled={busy}>Leave list</Button>}
        <Button onClick={onClose}>Done</Button>
      </DialogActions>
    </Dialog>
  );
}

function Person({ m, you, trailing }) {
  return (
    <ListItem disableGutters secondaryAction={trailing} sx={{ pr: 0 }}>
      <ListItemText
        sx={{ pr: 20 }}
        primary={<>{m.name}{you && <Typography component="span" variant="caption" color="text.secondary"> (you)</Typography>}</>}
        secondary={m.status === 'PENDING' ? `${m.identity} · waiting to accept` : m.identity}
        slotProps={{ primary: { noWrap: true }, secondary: { noWrap: true } }}
      />
    </ListItem>
  );
}
