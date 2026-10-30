import { useEffect, useState } from 'react';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField } from '@mui/material';
import { LIST_COLORS } from '../constants';

/** Create (list == null) or rename/recolour a list. */
export default function ListDialog({ open, list, onClose, onSave }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(LIST_COLORS[0]);
  useEffect(() => {
    if (open) {
      setName(list?.name ?? '');
      setColor(list?.color ?? LIST_COLORS[0]);
    }
  }, [open, list]);
  const save = () => name.trim() && onSave(name.trim(), color);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{list ? 'Edit list' : 'New list'}</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus name="listName" label="Name" value={name} sx={{ mt: 1 }}
          onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()}
        />
        <Box sx={{ display: 'flex', gap: 1, mt: 2, flexWrap: 'wrap' }}>
          {LIST_COLORS.map((c) => (
            <Box
              key={c} role="button" aria-label={`Color ${c}`} onClick={() => setColor(c)}
              sx={{ width: 32, height: 32, borderRadius: '50%', bgcolor: c, cursor: 'pointer', outline: color === c ? '3px solid' : 'none', outlineColor: 'text.primary', outlineOffset: 2 }}
            />
          ))}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={!name.trim()}>Save</Button>
      </DialogActions>
    </Dialog>
  );
}
