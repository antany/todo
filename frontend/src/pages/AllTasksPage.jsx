import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Chip, FormControlLabel, InputAdornment, List, Menu, MenuItem, IconButton, Stack, Switch, TextField, Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import SortIcon from '@mui/icons-material/Sort';
import TaskRow from '../components/TaskRow';
import TaskSheet from '../components/TaskSheet';
import DueReminders from '../components/DueReminders';
import { liveLists, subtasksOf, toggleTask, undoComplete, useStore } from '../db/store';
import { useToast } from '../toast';

const SORTS = { manual: 'Manual order', due: 'Due date', priority: 'Priority' };

function sorter(sort) {
  if (sort === 'due') return (a, b) => (a.dueAt ?? '9').localeCompare(b.dueAt ?? '9');
  if (sort === 'priority') return (a, b) => b.priority - a.priority || a.position - b.position;
  return (a, b) => a.position - b.position;
}

/** Every task from every list, grouped by list. Tap list chips to narrow it down. */
export default function AllTasksPage() {
  const state = useStore();
  const toast = useToast();
  const nav = useNavigate();
  const [picked, setPicked] = useState([]); // list ids; empty = all lists
  const [query, setQuery] = useState('');
  const [showDone, setShowDone] = useState(false);
  const [sort, setSort] = useState('manual');
  const [menu, setMenu] = useState(null);
  const [openId, setOpenId] = useState(null);

  const lists = liveLists(state);
  const shown = lists.filter((l) => !picked.length || picked.includes(l.id));
  const q = query.trim().toLowerCase();

  const groups = useMemo(() => shown.map((list) => {
    const tasks = state.tasks
      .filter((t) => t.listId === list.id && !t.deleted && (showDone || t.status !== 'DONE'))
      .filter((t) => !q || t.title.toLowerCase().includes(q) || t.notes.toLowerCase().includes(q) || t.tags.some((g) => g.includes(q)))
      .sort((a, b) => (a.status === 'DONE') - (b.status === 'DONE') || sorter(sort)(a, b));
    return { list, tasks };
  }).filter((g) => g.tasks.length), [state, shown, q, showDone, sort]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const count = groups.reduce((n, g) => n + g.tasks.length, 0);

  const onToggle = (t) => {
    const completing = t.status !== 'DONE';
    const spawned = toggleTask(t.id);
    if (completing) toast('Task completed', { label: 'Undo', run: () => undoComplete(t.id, spawned) });
  };

  return (
    <Box>
      <Stack direction="row" alignItems="center" sx={{ mb: 1 }}>
        <Typography variant="h5" sx={{ flex: 1 }}>All tasks</Typography>
        <Typography variant="body2" color="text.secondary">{count} shown</Typography>
        <IconButton aria-label="Sort" onClick={(e) => setMenu(e.currentTarget)}><SortIcon /></IconButton>
      </Stack>
      <Menu anchorEl={menu} open={!!menu} onClose={() => setMenu(null)}>
        {Object.entries(SORTS).map(([k, label]) => (
          <MenuItem key={k} selected={sort === k} onClick={() => { setSort(k); setMenu(null); }}>{label}</MenuItem>
        ))}
      </Menu>

      <DueReminders />
      <TextField
        name="search" placeholder="Search all tasks" value={query} onChange={(e) => setQuery(e.target.value)} sx={{ mb: 1 }}
        slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }}
      />
      <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mb: 1 }}>
        <Chip label="All lists" color={picked.length ? 'default' : 'primary'} onClick={() => setPicked([])} />
        {lists.map((l) => (
          <Chip
            key={l.id} label={l.name} variant={picked.includes(l.id) ? 'filled' : 'outlined'}
            color={picked.includes(l.id) ? 'primary' : 'default'} onClick={() => toggle(l.id)}
            icon={<Box component="span" sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: l.color, flexShrink: 0 }} />}
          />
        ))}
      </Stack>
      <FormControlLabel control={<Switch checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />} label="Show completed" sx={{ mb: 1 }} />

      {groups.length === 0 && (
        <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
          {state.tasks.some((t) => !t.deleted) ? 'No tasks match.' : 'No tasks yet. Open a list to add one.'}
        </Typography>
      )}
      {groups.map(({ list, tasks }) => (
        <Box key={list.id} sx={{ mb: 2 }}>
          <Stack direction="row" alignItems="center" spacing={1} onClick={() => nav(`/lists/${list.id}`)} sx={{ cursor: 'pointer', mt: 1 }}>
            <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: list.color }} />
            <Typography variant="subtitle2" color="text.secondary">{list.name} ({tasks.length})</Typography>
          </Stack>
          <List disablePadding>
            {tasks.map((t) => <TaskRow key={t.id} task={t} subs={subtasksOf(state, t.id)} onToggle={onToggle} onOpen={(x) => setOpenId(x.id)} />)}
          </List>
        </Box>
      ))}
      <TaskSheet taskId={openId} onClose={() => setOpenId(null)} />
    </Box>
  );
}
