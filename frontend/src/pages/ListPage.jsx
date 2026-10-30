import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Box, Button, Chip, Collapse, IconButton, InputAdornment, List, Menu, MenuItem, Stack, TextField, Typography,
} from '@mui/material';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import SortIcon from '@mui/icons-material/Sort';
import SearchIcon from '@mui/icons-material/Search';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import GroupIcon from '@mui/icons-material/Group';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import TaskRow from '../components/TaskRow';
import TaskSheet from '../components/TaskSheet';
import ListDialog from '../components/ListDialog';
import ShareDialog from '../components/ShareDialog';
import {
  addTask, canWrite, clearCompleted, isOwner, deleteList, restoreList, restoreTasks, reorderTasks, subtasksOf, toggleTask,
  undoComplete, updateList, useStore, listTasks,
} from '../db/store';
import { useToast } from '../toast';

const SORTS = { manual: 'Manual order', due: 'Due date', priority: 'Priority' };

function Sortable({ task, subs, onToggle, onOpen, enabled }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, disabled: !enabled });
  const handle = enabled ? (
    <IconButton aria-label="Drag to reorder" size="small" {...attributes} {...listeners} sx={{ touchAction: 'none', cursor: 'grab' }}>
      <DragIndicatorIcon />
    </IconButton>
  ) : null;
  return (
    <Box ref={setNodeRef} sx={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1, bgcolor: 'background.paper', position: 'relative', zIndex: isDragging ? 2 : 0 }}>
      <TaskRow task={task} subs={subs} onToggle={onToggle} onOpen={onOpen} handle={handle} />
    </Box>
  );
}

export default function ListPage() {
  const { id } = useParams();
  const state = useStore();
  const nav = useNavigate();
  const toast = useToast();
  const list = state.lists.find((l) => l.id === id && !l.deleted);
  const [title, setTitle] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('manual');
  const [tag, setTag] = useState(null);
  const [menu, setMenu] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [showDone, setShowDone] = useState(false);
  const [editing, setEditing] = useState(false);
  const [sharing, setSharing] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const tasks = useMemo(() => (list ? listTasks(state, list.id) : []), [state, list]);
  const tags = useMemo(() => [...new Set(tasks.flatMap((t) => t.tags))].sort(), [tasks]);
  const q = query.trim().toLowerCase();
  const filtered = tasks.filter((t) => (!q || t.title.toLowerCase().includes(q) || t.notes.toLowerCase().includes(q)) && (!tag || t.tags.includes(tag)));
  const open = filtered.filter((t) => t.status !== 'DONE').sort(sorter(sort));
  const done = filtered.filter((t) => t.status === 'DONE').sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
  const writable = list ? canWrite(state, list.id) : false;
  const owner = list ? isOwner(state, list.id) : false;
  const dragEnabled = writable && sort === 'manual' && !q && !tag;

  if (!list) return <Typography>This list does not exist. <Button onClick={() => nav('/lists')}>Back to lists</Button></Typography>;

  const onToggle = (t) => {
    const completing = t.status !== 'DONE';
    const spawned = toggleTask(t.id);
    if (completing) toast('Task completed', { label: 'Undo', run: () => undoComplete(t.id, spawned) });
  };
  const add = () => {
    if (!title.trim()) return;
    addTask(list.id, title);
    setTitle('');
  };
  const onDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const ids = open.map((t) => t.id);
    reorderTasks(arrayMove(ids, ids.indexOf(active.id), ids.indexOf(over.id)), active.id);
  };
  const removeList = () => {
    deleteList(list.id);
    nav('/lists');
    toast(`Deleted "${list.name}"`, { label: 'Undo', run: () => restoreList(list.id) });
  };
  const clearDone = () => {
    const ids = clearCompleted(list.id);
    toast(`Cleared ${ids.length} completed`, { label: 'Undo', run: () => restoreTasks(ids) });
  };

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        <Box sx={{ width: 14, height: 14, borderRadius: '50%', bgcolor: list.color }} />
        <Typography variant="h5" sx={{ flex: 1 }} noWrap>{list.name}</Typography>
        <IconButton aria-label="Sort" onClick={(e) => setMenu(e.currentTarget)}><SortIcon /></IconButton>
        <IconButton aria-label="Share" onClick={() => setSharing(true)}>{owner ? <PersonAddIcon /> : <GroupIcon />}</IconButton>
        {owner && <IconButton aria-label="Edit list" onClick={() => setEditing(true)}><EditIcon /></IconButton>}
        {owner && <IconButton aria-label="Delete list" onClick={removeList}><DeleteIcon /></IconButton>}
      </Stack>
      {!owner && (
        <Chip size="small" icon={<GroupIcon />} sx={{ mb: 1 }} label={`Shared by ${list.ownerName ?? 'someone'} · ${writable ? 'you can edit' : 'view only'}`} />
      )}
      <Menu anchorEl={menu} open={!!menu} onClose={() => setMenu(null)}>
        {Object.entries(SORTS).map(([k, label]) => (
          <MenuItem key={k} selected={sort === k} onClick={() => { setSort(k); setMenu(null); }}>{label}</MenuItem>
        ))}
      </Menu>

      {writable && <TextField
        name="newTask" placeholder="Add a task" value={title} onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && add()} sx={{ mb: 1.5 }}
        slotProps={{ input: { endAdornment: <InputAdornment position="end"><Button onClick={add} disabled={!title.trim()}>Add</Button></InputAdornment> } }}
      />}
      <TextField
        name="search" placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} sx={{ mb: 1 }}
        slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }}
      />
      {tags.length > 0 && (
        <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mb: 1 }}>
          {tags.map((t) => <Chip key={t} size="small" label={`#${t}`} color={tag === t ? 'primary' : 'default'} onClick={() => setTag(tag === t ? null : t)} />)}
        </Stack>
      )}

      {open.length === 0 && done.length === 0 && <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>{tasks.length ? 'Nothing matches.' : writable ? 'No tasks yet. Add one above.' : 'No tasks yet.'}</Typography>}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={open.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          <List disablePadding>
            {open.map((t) => (
              <Sortable key={t.id} task={t} subs={subtasksOf(state, t.id)} onToggle={onToggle} onOpen={(x) => setOpenId(x.id)} enabled={dragEnabled} />
            ))}
          </List>
        </SortableContext>
      </DndContext>

      {done.length > 0 && (
        <Box sx={{ mt: 2 }}>
          <Stack direction="row" alignItems="center">
            <Button onClick={() => setShowDone(!showDone)} endIcon={<ExpandMoreIcon sx={{ transform: showDone ? 'rotate(180deg)' : 'none' }} />}>
              Completed ({done.length})
            </Button>
            <Box sx={{ flex: 1 }} />
            {writable && <Button color="inherit" size="small" onClick={clearDone}>Clear completed</Button>}
          </Stack>
          <Collapse in={showDone} unmountOnExit>
            <List disablePadding>
              {done.map((t) => <TaskRow key={t.id} task={t} subs={subtasksOf(state, t.id)} onToggle={onToggle} onOpen={(x) => setOpenId(x.id)} />)}
            </List>
          </Collapse>
        </Box>
      )}

      <ShareDialog open={sharing} list={list} onClose={() => setSharing(false)} />
      <TaskSheet taskId={openId} onClose={() => setOpenId(null)} />
      <ListDialog open={editing} list={list} onClose={() => setEditing(false)} onSave={(name, color) => { updateList(list.id, { name, color }); setEditing(false); }} />
    </Box>
  );
}

function sorter(sort) {
  if (sort === 'due') return (a, b) => (a.dueAt ?? '9').localeCompare(b.dueAt ?? '9');
  if (sort === 'priority') return (a, b) => b.priority - a.priority || a.position - b.position;
  return (a, b) => a.position - b.position;
}
