import { useState } from 'react';
import { Box, List, Typography } from '@mui/material';
import TaskRow from '../components/TaskRow';
import TaskSheet from '../components/TaskSheet';
import { openTasks, subtasksOf, toggleTask, undoComplete, useStore } from '../db/store';
import { dayLabel, endOfDay, startOfDay } from '../db/util';
import { useToast } from '../toast';

const byDue = (key) => (a, b) => (a[key] ?? '').localeCompare(b[key] ?? '') || b.priority - a.priority;

/** Groups are [heading, tasks]; empty groups are hidden. */
const VIEWS = {
  today: {
    title: 'Today',
    empty: 'Nothing due today.',
    groups(tasks) {
      const sod = startOfDay().toISOString();
      const eod = endOfDay().toISOString();
      const due = tasks.filter((t) => t.dueAt && t.dueAt <= eod).sort(byDue('dueAt'));
      return [['Overdue', due.filter((t) => t.dueAt < sod)], ['Today', due.filter((t) => t.dueAt >= sod)]];
    },
  },
  upcoming: {
    title: 'Upcoming',
    empty: 'Nothing scheduled.',
    groups(tasks) {
      const eod = endOfDay().toISOString();
      const later = tasks.filter((t) => t.dueAt && t.dueAt > eod).sort(byDue('dueAt'));
      const days = new Map();
      later.forEach((t) => {
        const k = dayLabel(t.dueAt);
        days.set(k, [...(days.get(k) ?? []), t]);
      });
      return [...days];
    },
  },
  followup: {
    title: 'Follow-up',
    empty: 'No follow-ups to track.',
    groups(tasks) {
      const eod = endOfDay().toISOString();
      const withDate = tasks.filter((t) => t.followUpAt).sort(byDue('followUpAt'));
      return [
        ['Due for follow-up', withDate.filter((t) => t.followUpAt <= eod)],
        ['Scheduled', withDate.filter((t) => t.followUpAt > eod)],
        ['Waiting (no date)', tasks.filter((t) => t.status === 'WAITING' && !t.followUpAt)],
      ];
    },
  },
};

export default function SmartPage({ mode }) {
  const view = VIEWS[mode];
  const state = useStore();
  const toast = useToast();
  const [openId, setOpenId] = useState(null);
  const groups = view.groups(openTasks(state)).filter(([, ts]) => ts.length);
  const listOf = (t) => state.lists.find((l) => l.id === t.listId);

  const onToggle = (t) => {
    const spawned = toggleTask(t.id);
    toast('Task completed', { label: 'Undo', run: () => undoComplete(t.id, spawned) });
  };

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 1 }}>{view.title}</Typography>
      {groups.length === 0 && <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>{view.empty}</Typography>}
      {groups.map(([heading, tasks]) => (
        <Box key={heading} sx={{ mb: 2 }}>
          <Typography variant="subtitle2" color={heading === 'Overdue' ? 'error' : 'text.secondary'} sx={{ mt: 1 }}>{heading}</Typography>
          <List disablePadding>
            {tasks.map((t) => <TaskRow key={t.id} task={t} list={listOf(t)} subs={subtasksOf(state, t.id)} onToggle={onToggle} onOpen={(x) => setOpenId(x.id)} />)}
          </List>
        </Box>
      ))}
      <TaskSheet taskId={openId} onClose={() => setOpenId(null)} />
    </Box>
  );
}
