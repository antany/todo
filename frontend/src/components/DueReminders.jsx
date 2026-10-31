import { useState } from 'react';
import { Box, Button, Card, Menu, MenuItem, Stack, Typography } from '@mui/material';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import TaskSheet from './TaskSheet';
import { canWrite, updateTask, useStore } from '../db/store';
import { formatWhen, quickDate } from '../db/util';
import { useDueReminders } from '../reminders';

const FIELD = { remind: 'remindAt', follow: 'followUpAt' };
const SNOOZES = [['In 1 hour', () => new Date(Date.now() + 3600_000).toISOString()], ['Tomorrow 9:00', () => quickDate('tomorrow')], ['Next week', () => quickDate('week')]];

/** Reminders and follow-ups that are due now: open, snooze or dismiss each one. */
export default function DueReminders() {
  const state = useStore();
  const due = useDueReminders();
  const [openId, setOpenId] = useState(null);
  const [snooze, setSnooze] = useState(null); // { anchor, item }
  if (!due.length && !openId) return null;

  return (
    <Box sx={{ mb: 2 }}>
      {due.length > 0 && (
        <Card sx={{ p: 1.5 }}>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
            <NotificationsActiveIcon color="secondary" fontSize="small" />
            <Typography variant="subtitle2">Due now ({due.length})</Typography>
          </Stack>
          {due.map((d) => {
            const editable = canWrite(state, d.task.listId);
            return (
              <Box key={`${d.task.id}:${d.kind}`} sx={{ py: 0.75, borderTop: 1, borderColor: 'divider' }}>
                <Typography noWrap sx={{ cursor: 'pointer' }} onClick={() => setOpenId(d.task.id)}>{d.task.title}</Typography>
                <Typography variant="caption" color="text.secondary">{d.kind === 'remind' ? 'Reminder' : 'Follow up'} · {formatWhen(d.at)}</Typography>
                {editable && (
                  <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
                    <Button size="small" aria-label={`Snooze ${d.task.title}`} onClick={(e) => setSnooze({ anchor: e.currentTarget, item: d })}>Snooze</Button>
                    <Button size="small" color="inherit" onClick={() => updateTask(d.task.id, { [FIELD[d.kind]]: null })}>Dismiss</Button>
                  </Stack>
                )}
              </Box>
            );
          })}
        </Card>
      )}
      <Menu anchorEl={snooze?.anchor} open={!!snooze?.anchor} onClose={() => setSnooze(null)}>
        {SNOOZES.map(([label, when]) => (
          <MenuItem key={label} onClick={() => { updateTask(snooze.item.task.id, { [FIELD[snooze.item.kind]]: when() }); setSnooze(null); }}>{label}</MenuItem>
        ))}
      </Menu>
      <TaskSheet taskId={openId} onClose={() => setOpenId(null)} />
    </Box>
  );
}
