import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Badge, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, List, ListItem, ListItemText,
  Stack, Tooltip, Typography,
} from '@mui/material';
import MailIcon from '@mui/icons-material/MailOutline';
import { api } from '../api';
import { useSession } from '../session';
import { syncNow } from '../sync/engine';

/** Pending list invitations, polled while signed in. Accepting pulls the shared list in with a sync. */
function useInvitations() {
  const { me } = useSession();
  const [items, setItems] = useState([]);
  const refresh = useCallback(async () => {
    if (!me) return setItems([]);
    try {
      setItems(await api.get('/api/invitations'));
    } catch { /* offline or signed out: keep what we had */ }
  }, [me]);
  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 60_000);
    const visible = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('online', refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('online', refresh);
    };
  }, [refresh]);
  return [items, refresh];
}

/** App-bar envelope with a count; hidden when signed out. */
export default function InvitationsButton() {
  const { me } = useSession();
  const [items, refresh] = useInvitations();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (!me) return null;

  const answer = async (listId, verb) => {
    setBusy(true);
    setError('');
    try {
      await api.post(`/api/invitations/${listId}/${verb}`);
      if (verb === 'accept') await syncNow();
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Tooltip title="Invitations">
        <IconButton color="inherit" aria-label={`Invitations (${items.length})`} onClick={() => { refresh(); setOpen(true); }}>
          <Badge badgeContent={items.length} color="secondary"><MailIcon /></Badge>
        </IconButton>
      </Tooltip>
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Invitations</DialogTitle>
        <DialogContent>
          {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}
          {items.length === 0 && <Typography color="text.secondary">No pending invitations.</Typography>}
          <List disablePadding>
            {items.map((i) => (
              <ListItem key={i.listId} disableGutters divider sx={{ display: 'block' }}>
                <Stack direction="row" alignItems="center" spacing={1.25}>
                  <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: i.color, flexShrink: 0 }} />
                  <ListItemText
                    primary={i.listName}
                    secondary={`${i.invitedBy ?? 'Someone'} invited you to ${i.role === 'EDITOR' ? 'edit' : 'view'} this list`}
                  />
                </Stack>
                <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end', mt: 0.5 }}>
                  <Button size="small" color="inherit" disabled={busy} onClick={() => answer(i.listId, 'decline')}>Decline</Button>
                  <Button size="small" variant="contained" disabled={busy} onClick={() => answer(i.listId, 'accept')}>Accept</Button>
                </Stack>
              </ListItem>
            ))}
          </List>
        </DialogContent>
        <DialogActions><Button onClick={() => setOpen(false)}>Close</Button></DialogActions>
      </Dialog>
    </>
  );
}
