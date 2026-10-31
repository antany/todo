import { Box, Checkbox, Chip, ListItem, ListItemButton, Stack, Typography } from '@mui/material';
import FlagIcon from '@mui/icons-material/Flag';
import EventIcon from '@mui/icons-material/Event';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import AlarmIcon from '@mui/icons-material/Alarm';
import RepeatIcon from '@mui/icons-material/Repeat';
import ChecklistIcon from '@mui/icons-material/Checklist';
import HourglassTopIcon from '@mui/icons-material/HourglassTop';
import { PRIORITIES } from '../constants';
import { formatWhen } from '../db/util';
import { canWrite, useStore } from '../db/store';

/** One task line: checkbox, title, and small chips for due date, follow-up, subtasks, repeat, tags. */
export default function TaskRow({ task, subs = [], list, onToggle, onOpen, handle }) {
  const readOnly = !canWrite(useStore(), task.listId);
  const done = task.status === 'DONE';
  const now = Date.now();
  const overdue = !done && task.dueAt && new Date(task.dueAt) < now;
  const followDue = !done && task.followUpAt && new Date(task.followUpAt) <= now;
  const prio = PRIORITIES[task.priority];
  const doneSubs = subs.filter((s) => s.done).length;

  return (
    <ListItem disablePadding divider secondaryAction={handle}>
      <Checkbox
        edge="start"
        checked={done}
        disabled={readOnly}
        onChange={() => onToggle(task)}
        inputProps={{ 'aria-label': `Complete ${task.title}` }}
        sx={{ ml: 0.5, color: task.priority ? `${prio.color}.main` : undefined }}
      />
      <ListItemButton onClick={() => onOpen(task)} sx={{ py: 1, pr: handle ? 7 : 2 }}>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography noWrap sx={{ textDecoration: done ? 'line-through' : 'none', opacity: done ? 0.55 : 1 }}>
            {task.title}
          </Typography>
          <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mt: 0.5, empty: 'hide' }}>
            {list && <Chip size="small" variant="outlined" label={list.name} sx={{ borderColor: list.color }} />}
            {task.priority > 0 && <Chip size="small" icon={<FlagIcon />} color={prio.color} variant="outlined" label={prio.label} />}
            {task.dueAt && (
              <Chip size="small" icon={<EventIcon />} color={overdue ? 'error' : 'default'} variant={overdue ? 'filled' : 'outlined'} label={formatWhen(task.dueAt)} />
            )}
            {task.followUpAt && !done && (
              <Chip size="small" icon={<NotificationsActiveIcon />} color={followDue ? 'secondary' : 'default'} variant={followDue ? 'filled' : 'outlined'} label={`Follow up ${formatWhen(task.followUpAt)}`} />
            )}
            {task.remindAt && !done && (
              <Chip size="small" icon={<AlarmIcon />} variant="outlined" label={formatWhen(task.remindAt)} />
            )}
            {task.status === 'WAITING' && <Chip size="small" icon={<HourglassTopIcon />} variant="outlined" label="Waiting" />}
            {task.status === 'IN_PROGRESS' && <Chip size="small" color="primary" variant="outlined" label="In progress" />}
            {subs.length > 0 && <Chip size="small" icon={<ChecklistIcon />} variant="outlined" label={`${doneSubs}/${subs.length}`} />}
            {task.repeatRule !== 'NONE' && <Chip size="small" icon={<RepeatIcon />} variant="outlined" label={task.repeatRule.toLowerCase()} />}
            {task.tags.map((t) => <Chip key={t} size="small" label={`#${t}`} />)}
          </Stack>
        </Box>
      </ListItemButton>
    </ListItem>
  );
}
