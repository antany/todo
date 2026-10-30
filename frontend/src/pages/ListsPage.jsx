import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Fab, IconButton, List, ListItem, ListItemButton, ListItemText, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import GroupIcon from '@mui/icons-material/Group';
import ListDialog from '../components/ListDialog';
import { addList, isOwner, liveLists, listTasks, updateList, useStore } from '../db/store';

export default function ListsPage() {
  const state = useStore();
  const nav = useNavigate();
  const [dialog, setDialog] = useState(null); // { list } | null
  const lists = liveLists(state);

  const save = (name, color) => {
    if (dialog.list) updateList(dialog.list.id, { name, color });
    else nav(`/lists/${addList(name, color)}`);
    setDialog(null);
  };

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 1 }}>My lists</Typography>
      <List>
        {lists.map((l) => {
          const open = listTasks(state, l.id).filter((t) => t.status !== 'DONE').length;
          return (
            <ListItem key={l.id} disablePadding divider secondaryAction={
              isOwner(state, l.id) && <IconButton aria-label={`Edit ${l.name}`} onClick={() => setDialog({ list: l })}><EditIcon /></IconButton>
            }>
              <ListItemButton onClick={() => nav(`/lists/${l.id}`)}>
                <Box sx={{ width: 14, height: 14, borderRadius: '50%', bgcolor: l.color, mr: 2, flexShrink: 0 }} />
                {!isOwner(state, l.id) && <GroupIcon fontSize="small" color="action" sx={{ mr: 1 }} />}
                <ListItemText primary={l.name} secondary={isOwner(state, l.id) ? `${open} open` : `${open} open · shared by ${l.ownerName ?? 'someone'}`} />
              </ListItemButton>
            </ListItem>
          );
        })}
      </List>
      <Fab color="primary" aria-label="New list" onClick={() => setDialog({ list: null })} sx={{ position: 'fixed', right: 20, bottom: { xs: 100, md: 24 } }}>
        <AddIcon />
      </Fab>
      <ListDialog open={!!dialog} list={dialog?.list} onClose={() => setDialog(null)} onSave={save} />
    </Box>
  );
}
