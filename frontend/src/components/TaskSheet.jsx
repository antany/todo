import { useEffect, useState } from 'react';
import {
  Box, Button, Checkbox, Chip, Divider, Drawer, IconButton, InputAdornment, List, ListItem, MenuItem,
  Stack, TextField, Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import {
  activityOf, addSubtask, canWrite, deleteSubtask, deleteTask, liveLists, logFollowUp, restoreTask, setTaskStatus,
  subtasksOf, undoComplete, updateSubtask, updateTask, useStore,
} from '../db/store';
import { formatWhen, fromInput, quickDate, toInput } from '../db/util';
import { PRIORITIES, REPEATS, STATUSES } from '../constants';
import { useToast } from '../toast';

function DateField({ label, value, onChange }) {
  return (
    <Box>
      <TextField
        label={label}
        type="datetime-local"
        value={toInput(value)}
        onChange={(e) => onChange(fromInput(e.target.value))}
        slotProps={{ inputLabel: { shrink: true } }}
      />
      <Stack direction="row" spacing={0.75} sx={{ mt: 0.75 }}>
        {[['today', 'Today'], ['tomorrow', 'Tomorrow'], ['week', 'Next week']].map(([k, l]) => (
          <Chip key={k} size="small" label={l} onClick={() => onChange(quickDate(k))} />
        ))}
        {value && <Chip size="small" label="Clear" onClick={() => onChange(null)} />}
      </Stack>
    </Box>
  );
}

const FIELD_LABELS = { title: 'title', notes: 'notes', priority: 'priority', dueAt: 'due date', followUpAt: 'follow-up date', remindAt: 'reminder', repeatRule: 'repeat', tags: 'tags' };

function describe(a, lists) {
  const d = a.detail || {};
  switch (a.kind) {
    case 'created': return d.repeatOf ? 'Created by repeat' : 'Created';
    case 'edited': return `Edited ${d.fields.map((f) => FIELD_LABELS[f] ?? f).join(', ')}`;
    case 'status_changed': return `Status ${d.from} → ${d.to}`;
    case 'completed': return 'Completed';
    case 'reopened': return 'Reopened';
    case 'follow_up_set': return `Follow-up set for ${formatWhen(d.at)}`;
    case 'followed_up': return `Followed up${d.note ? `: ${d.note}` : ''}${d.next ? ` (next ${formatWhen(d.next)})` : ''}`;
    case 'moved': return `Moved to ${lists.find((l) => l.id === d.to)?.name ?? 'another list'}`;
    default: return a.kind;
  }
}

/** Bottom sheet with every task field, subtasks and the activity timeline. */
export default function TaskSheet({ taskId, onClose }) {
  const state = useStore();
  const toast = useToast();
  const task = state.tasks.find((t) => t.id === taskId && !t.deleted);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [tagText, setTagText] = useState('');
  const [sub, setSub] = useState('');
  const [note, setNote] = useState('');

  // Reset the text drafts when a different task opens.
  useEffect(() => {
    setTitle(task?.title ?? '');
    setNotes(task?.notes ?? '');
    setSub('');
    setNote('');
    setTagText('');
  }, [taskId]); // eslint-disable-line react-hooks/exhaustive-deps

  const readOnly = task ? !canWrite(state, task.listId) : false;
  const lists = liveLists(state);
  const writable = lists.filter((l) => canWrite(state, l.id));
  const subs = task ? subtasksOf(state, task.id) : [];
  const activity = task ? activityOf(state, task.id) : [];
  const set = (patch) => updateTask(task.id, patch);

  const commitTitle = () => (title.trim() ? set({ title: title.trim() }) : setTitle(task.title));
  const addTag = () => {
    const t = tagText.trim().replace(/^#/, '').toLowerCase();
    if (t && !task.tags.includes(t)) set({ tags: [...task.tags, t] });
    setTagText('');
  };
  const changeStatus = (status) => {
    const spawned = setTaskStatus(task.id, status);
    if (status === 'DONE') toast('Completed', { label: 'Undo', run: () => undoComplete(task.id, spawned) });
  };
  const remove = () => {
    deleteTask(task.id);
    onClose();
    toast('Task deleted', { label: 'Undo', run: () => restoreTask(task.id) });
  };
  const followUp = () => {
    logFollowUp(task.id, note, task.followUpAt && new Date(task.followUpAt) > new Date() ? task.followUpAt : null);
    setNote('');
  };

  return (
    <Drawer
      anchor="bottom"
      open={!!task}
      onClose={onClose}
      slotProps={{ paper: { sx: { maxHeight: '92vh', borderTopLeftRadius: 20, borderTopRightRadius: 20, width: '100%', maxWidth: 640, mx: 'auto' } } }}
    >
      {task && (
        <Box sx={{ p: 2, pb: 4, overflowY: 'auto' }}>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
            <Checkbox disabled={readOnly} checked={task.status === 'DONE'} onChange={() => changeStatus(task.status === 'DONE' ? 'TODO' : 'DONE')} />
            <TextField
              name="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
              variant="standard" disabled={readOnly}
              slotProps={{ input: { sx: { fontSize: 20, fontWeight: 600 } } }}
            />
            <IconButton aria-label="Close" onClick={onClose}><CloseIcon /></IconButton>
          </Stack>

          {readOnly && <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>You can view this list but not change it.</Typography>}
          <Stack spacing={2} component="fieldset" disabled={readOnly} sx={{ border: 0, p: 0, m: 0, minWidth: 0, '& .MuiChip-root': readOnly ? { pointerEvents: 'none' } : {} }}>
            <TextField
              name="notes" label="Notes" multiline minRows={2} maxRows={8} value={notes}
              onChange={(e) => setNotes(e.target.value)} onBlur={() => set({ notes })}
            />
            <Stack direction="row" spacing={1.5}>
              <TextField select label="List" value={task.listId} onChange={(e) => set({ listId: e.target.value })} slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}>
                {(writable.some((l) => l.id === task.listId) ? writable : lists).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </TextField>
              <TextField select label="Priority" value={task.priority} onChange={(e) => set({ priority: Number(e.target.value) })} slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}>
                {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </TextField>
            </Stack>
            <TextField select label="Status" value={task.status} onChange={(e) => changeStatus(e.target.value)} slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}>
              {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </TextField>
            <DateField label="Due" value={task.dueAt} onChange={(v) => set({ dueAt: v, ...(v ? {} : { repeatRule: 'NONE' }) })} />
            <DateField label="Follow up" value={task.followUpAt} onChange={(v) => set({ followUpAt: v })} />
            <DateField label="Remind me" value={task.remindAt} onChange={(v) => set({ remindAt: v })} />
            <TextField
              select label="Repeat" value={task.repeatRule} disabled={!task.dueAt}
              helperText={task.dueAt ? 'Completing creates the next occurrence' : 'Set a due date to repeat'}
              onChange={(e) => set({ repeatRule: e.target.value })} slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
            >
              {REPEATS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </TextField>

            <Box>
              <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mb: 1 }}>
                {task.tags.map((t) => <Chip key={t} label={`#${t}`} onDelete={() => set({ tags: task.tags.filter((x) => x !== t) })} />)}
              </Stack>
              <TextField
                name="tag" label="Add tag" value={tagText} onChange={(e) => setTagText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addTag()}
              />
            </Box>

            <Box>
              <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Subtasks</Typography>
              <List dense disablePadding>
                {subs.map((s) => (
                  <ListItem key={s.id} disablePadding secondaryAction={<IconButton size="small" aria-label="Delete subtask" onClick={() => deleteSubtask(s.id)}><DeleteIcon fontSize="small" /></IconButton>}>
                    <Checkbox size="small" checked={s.done} onChange={() => updateSubtask(s.id, { done: !s.done })} />
                    <Typography sx={{ textDecoration: s.done ? 'line-through' : 'none', opacity: s.done ? 0.6 : 1 }}>{s.title}</Typography>
                  </ListItem>
                ))}
              </List>
              <TextField
                name="subtask" placeholder="Add subtask" value={sub} onChange={(e) => setSub(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && sub.trim()) { addSubtask(task.id, sub); setSub(''); } }}
                slotProps={{ input: { startAdornment: <InputAdornment position="start"><AddIcon fontSize="small" /></InputAdornment> } }}
              />
            </Box>

            <Divider />
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>Follow-up &amp; activity</Typography>
              <Stack direction="row" spacing={1}>
                <TextField name="followNote" placeholder="Note for this follow-up" value={note} onChange={(e) => setNote(e.target.value)} />
                <Button variant="outlined" onClick={followUp} sx={{ whiteSpace: 'nowrap' }}>Log follow-up</Button>
              </Stack>
              <Typography variant="caption" color="text.secondary">
                Logging keeps a future follow-up date and clears one that has passed; set a new date above to keep tracking.
              </Typography>
              <List dense>
                {activity.map((a) => (
                  <ListItem key={a.id} disableGutters sx={{ display: 'block' }}>
                    <Typography variant="body2">{describe(a, lists)}</Typography>
                    <Typography variant="caption" color="text.secondary">{formatWhen(a.at)}</Typography>
                  </ListItem>
                ))}
              </List>
            </Box>

            <Button color="error" startIcon={<DeleteIcon />} onClick={remove}>Delete task</Button>
          </Stack>
        </Box>
      )}
    </Drawer>
  );
}
