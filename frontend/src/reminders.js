import { useEffect, useState } from 'react';
import { liveLists, openTasks, useStore } from './db/store';

/**
 * Reminders fire only while the app is open (a PWA cannot wake itself in the background without a push
 * server). A task is "due" once its remind time or follow-up time has passed and it is not done.
 */
const NOTIFY_KEY = 'todo.notify'; // '1' = the person turned notifications on
const SEEN_KEY = 'todo.notified'; // keys of reminders already announced, so each fires once
const TICK_MS = 30_000;

const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } };

export const notificationsSupported = () => typeof Notification !== 'undefined';
export const notificationsOn = () => notificationsSupported() && read(NOTIFY_KEY) === '1' && Notification.permission === 'granted';

/** Ask permission and remember the choice. Returns 'on', 'denied' or 'unsupported'. */
export async function enableNotifications() {
  if (!notificationsSupported()) return 'unsupported';
  const result = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (result !== 'granted') return 'denied';
  write(NOTIFY_KEY, '1');
  return 'on';
}
export const disableNotifications = () => write(NOTIFY_KEY, '0');

/** Open tasks whose reminder or follow-up time has passed, oldest first. */
export function dueReminders(state, now = Date.now()) {
  const out = [];
  for (const task of openTasks(state)) {
    if (task.remindAt && Date.parse(task.remindAt) <= now) out.push({ task, kind: 'remind', at: task.remindAt });
    if (task.followUpAt && Date.parse(task.followUpAt) <= now) out.push({ task, kind: 'follow', at: task.followUpAt });
  }
  return out.sort((a, b) => a.at.localeCompare(b.at));
}

const keyOf = (d) => `${d.task.id}:${d.kind}:${d.at}`;

export function useDueReminders() {
  const state = useStore();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const timer = setInterval(tick, TICK_MS);
    const visible = () => document.visibilityState === 'visible' && tick();
    document.addEventListener('visibilitychange', visible);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', visible); };
  }, []);
  return dueReminders(state, now);
}

async function show(d, listName) {
  const title = d.kind === 'remind' ? `Reminder: ${d.task.title}` : `Follow up: ${d.task.title}`;
  const options = { body: listName, tag: keyOf(d), icon: `${import.meta.env.BASE_URL}icons/icon-192.png` };
  try {
    const reg = await navigator.serviceWorker?.ready;
    if (reg) return await reg.showNotification(title, options);
  } catch { /* fall through to the page-level API */ }
  new Notification(title, options); // eslint-disable-line no-new
}

/** Announces newly due reminders once each (system notification while the app is in the background) and badges the tab title. */
export function useReminderAnnouncer() {
  const state = useStore();
  const due = useDueReminders();

  useEffect(() => {
    document.title = due.length ? `(${due.length}) Todo` : 'Todo';
  }, [due.length]);

  useEffect(() => {
    let seen;
    try { seen = new Set(JSON.parse(read(SEEN_KEY) ?? '[]')); } catch { seen = new Set(); }
    const fresh = due.filter((d) => !seen.has(keyOf(d)));
    if (!fresh.length) return;
    const listName = (d) => liveLists(state).find((l) => l.id === d.task.listId)?.name ?? '';
    if (notificationsOn() && document.visibilityState !== 'visible') fresh.forEach((d) => show(d, listName(d)));
    fresh.forEach((d) => seen.add(keyOf(d)));
    write(SEEN_KEY, JSON.stringify([...seen].slice(-500)));
  }, [due, state]);
}
