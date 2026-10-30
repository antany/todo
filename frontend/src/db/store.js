import { useSyncExternalStore } from 'react';
import { addPeriod, nowIso, uid } from './util';

/**
 * Local-first store: the single source of truth for lists, tasks, subtasks and activity. It lives in
 * localStorage, so the app works identically offline and signed out. Every mutation stamps `updatedAt`
 * and marks the row `dirty` (the sync engine, added later, pushes dirty rows). Deletes are tombstones.
 */
const KEY = 'todo.v1';
const empty = () => ({ lists: [], tasks: [], subtasks: [], activity: [] });

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...empty(), ...JSON.parse(raw) };
  } catch {
    /* unreadable or blocked storage: start fresh */
  }
  const s = empty();
  s.lists.push(newList('My tasks', '#3949ab', 1, { seed: true }));
  return s;
}

function newList(name, color, position, extra = {}) {
  return { id: uid(), name, color, position, archived: false, deleted: false, updatedAt: nowIso(), dirty: true, ...extra };
}

let state = load();
const listeners = new Set();

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* quota or private mode: keep working in memory */
  }
}

function commit(patch) {
  state = { ...state, ...patch };
  persist();
  listeners.forEach((l) => l());
}

persist(); // save the first-run seed so other tabs and reloads see the same list ids

if (typeof window !== 'undefined') {
  // Another tab changed the data.
  window.addEventListener('storage', (e) => {
    if (e.key === KEY && e.newValue) {
      try {
        state = { ...empty(), ...JSON.parse(e.newValue) };
        listeners.forEach((l) => l());
      } catch {
        /* ignore */
      }
    }
  });
}

export function useStore() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
  );
}

const touch = (row, patch) => ({ ...row, ...patch, updatedAt: nowIso(), dirty: true });
const replace = (rows, id, fn) => rows.map((r) => (r.id === id ? fn(r) : r));
const maxPos = (rows) => rows.reduce((m, r) => Math.max(m, r.position), 0);
const activityRow = (taskId, kind, detail = {}) => ({ id: uid(), taskId, actorId: null, kind, detail, at: nowIso(), dirty: true });

// ---------- selectors ----------
export const liveLists = (s) => s.lists.filter((l) => !l.deleted && !l.archived).sort((a, b) => a.position - b.position);
export const listTasks = (s, listId) => s.tasks.filter((t) => t.listId === listId && !t.deleted);
export const subtasksOf = (s, taskId) => s.subtasks.filter((x) => x.taskId === taskId && !x.deleted).sort((a, b) => a.position - b.position);
export const activityOf = (s, taskId) => s.activity.filter((a) => a.taskId === taskId).sort((a, b) => b.at.localeCompare(a.at));
/** Open tasks across all live lists (for Today / Upcoming / Follow-up). */
export function openTasks(s) {
  const ok = new Set(liveLists(s).map((l) => l.id));
  return s.tasks.filter((t) => !t.deleted && t.status !== 'DONE' && ok.has(t.listId));
}

/** OWNER for lists made here (no role yet) or owned by this account; EDITOR / VIEWER for lists shared with us. */
export const listRole = (s, listId) => s.lists.find((l) => l.id === listId)?.role ?? 'OWNER';
export const canWrite = (s, listId) => listRole(s, listId) !== 'VIEWER';
export const isOwner = (s, listId) => listRole(s, listId) === 'OWNER';

// ---------- lists ----------
export function addList(name, color) {
  const list = newList(name.trim(), color, maxPos(state.lists) + 1);
  commit({ lists: [...state.lists, list] });
  return list.id;
}
export const updateList = (id, patch) => commit({ lists: replace(state.lists, id, (l) => touch(l, { ...patch, seed: false })) });
export const deleteList = (id) => commit({ lists: replace(state.lists, id, (l) => touch(l, { deleted: true })) });
export const restoreList = (id) => commit({ lists: replace(state.lists, id, (l) => touch(l, { deleted: false })) });

// ---------- tasks ----------
export function addTask(listId, title, extra = {}) {
  const now = nowIso();
  const task = {
    id: uid(), listId, title: title.trim(), notes: '', priority: 0, dueAt: null, followUpAt: null, remindAt: null,
    repeatRule: 'NONE', status: 'TODO', completedAt: null, tags: [], deleted: false,
    position: maxPos(listTasks(state, listId)) + 1, updatedAt: now, dirty: true, ...extra,
  };
  commit({ tasks: [...state.tasks, task], activity: [...state.activity, activityRow(task.id, 'created')] });
  return task.id;
}

const SILENT = new Set(['position', 'completedAt', 'status', 'deleted', 'listId']);

export function updateTask(id, patch) {
  const old = state.tasks.find((t) => t.id === id);
  if (!old) return;
  const changed = Object.keys(patch).filter((k) => JSON.stringify(patch[k]) !== JSON.stringify(old[k]));
  if (!changed.length) return;
  const log = [];
  const fields = changed.filter((k) => !SILENT.has(k));
  if (fields.length) log.push(activityRow(id, 'edited', { fields }));
  if (changed.includes('followUpAt') && patch.followUpAt) log.push(activityRow(id, 'follow_up_set', { at: patch.followUpAt }));
  if (changed.includes('listId')) log.push(activityRow(id, 'moved', { to: patch.listId }));
  commit({ tasks: replace(state.tasks, id, (t) => touch(t, patch)), activity: [...state.activity, ...log] });
}

/** Set a status. Completing a repeating task spawns the next occurrence; returns its id (for undo). */
export function setTaskStatus(id, status) {
  const old = state.tasks.find((t) => t.id === id);
  if (!old || old.status === status) return null;
  const done = status === 'DONE';
  const log = [activityRow(id, done ? 'completed' : old.status === 'DONE' ? 'reopened' : 'status_changed', { from: old.status, to: status })];
  let tasks = replace(state.tasks, id, (t) => touch(t, { status, completedAt: done ? nowIso() : null }));
  let subtasks = state.subtasks;
  let spawned = null;
  if (done && old.repeatRule !== 'NONE' && old.dueAt) {
    const step = (iso) => (iso ? shift(iso, old.dueAt, old.repeatRule) : null);
    spawned = uid();
    tasks = [...tasks, {
      ...old, id: spawned, status: 'TODO', completedAt: null, dueAt: addPeriod(old.dueAt, old.repeatRule),
      followUpAt: step(old.followUpAt), remindAt: step(old.remindAt), position: maxPos(listTasks(state, old.listId)) + 1,
      updatedAt: nowIso(), dirty: true,
    }];
    subtasks = [...subtasks, ...subtasksOf(state, id).map((x) => ({ ...x, id: uid(), taskId: spawned, done: false, updatedAt: nowIso(), dirty: true }))];
    log.push(activityRow(spawned, 'created', { repeatOf: id }));
  }
  commit({ tasks, subtasks, activity: [...state.activity, ...log] });
  return spawned;
}

/** Shift `iso` by the same amount the due date moved. */
function shift(iso, due, rule) {
  const delta = new Date(addPeriod(due, rule)) - new Date(due);
  return new Date(new Date(iso).getTime() + delta).toISOString();
}

export function toggleTask(id) {
  const t = state.tasks.find((x) => x.id === id);
  return t ? setTaskStatus(id, t.status === 'DONE' ? 'TODO' : 'DONE') : null;
}

export function undoComplete(id, spawnedId) {
  setTaskStatus(id, 'TODO');
  if (spawnedId) deleteTask(spawnedId);
}

export const deleteTask = (id) => commit({ tasks: replace(state.tasks, id, (t) => touch(t, { deleted: true })) });
export const restoreTask = (id) => commit({ tasks: replace(state.tasks, id, (t) => touch(t, { deleted: false })) });

export function clearCompleted(listId) {
  const ids = new Set(listTasks(state, listId).filter((t) => t.status === 'DONE').map((t) => t.id));
  commit({ tasks: state.tasks.map((t) => (ids.has(t.id) ? touch(t, { deleted: true }) : t)) });
  return [...ids];
}
export function restoreTasks(ids) {
  const set = new Set(ids);
  commit({ tasks: state.tasks.map((t) => (set.has(t.id) ? touch(t, { deleted: false }) : t)) });
}

/** `orderedIds` is the visible manual order; only the moved row gets a new fractional position. */
export function reorderTasks(orderedIds, movedId) {
  const pos = (id) => state.tasks.find((t) => t.id === id)?.position ?? 0;
  const i = orderedIds.indexOf(movedId);
  const prev = i > 0 ? pos(orderedIds[i - 1]) : null;
  const next = i < orderedIds.length - 1 ? pos(orderedIds[i + 1]) : null;
  if (prev !== null && next !== null && Math.abs(next - prev) < 1e-6) {
    // Neighbours too close: renumber the whole visible run.
    const rank = new Map(orderedIds.map((id, n) => [id, n + 1]));
    commit({ tasks: state.tasks.map((t) => (rank.has(t.id) ? touch(t, { position: rank.get(t.id) }) : t)) });
    return;
  }
  const p = prev !== null && next !== null ? (prev + next) / 2 : prev !== null ? prev + 1 : next !== null ? next - 1 : 1;
  commit({ tasks: replace(state.tasks, movedId, (t) => touch(t, { position: p })) });
}

export function logFollowUp(taskId, note, nextFollowUpAt) {
  const t = state.tasks.find((x) => x.id === taskId);
  if (!t) return;
  commit({
    tasks: replace(state.tasks, taskId, (x) => touch(x, { followUpAt: nextFollowUpAt || null })),
    activity: [...state.activity, activityRow(taskId, 'followed_up', { note: note.trim(), next: nextFollowUpAt || null })],
  });
}

// ---------- subtasks ----------
export function addSubtask(taskId, title) {
  const row = { id: uid(), taskId, title: title.trim(), done: false, position: maxPos(subtasksOf(state, taskId)) + 1, deleted: false, updatedAt: nowIso(), dirty: true };
  commit({ subtasks: [...state.subtasks, row] });
}
export const updateSubtask = (id, patch) => commit({ subtasks: replace(state.subtasks, id, (x) => touch(x, patch)) });
export const deleteSubtask = (id) => updateSubtask(id, { deleted: true });

// ---------- backup ----------
export const exportData = () => JSON.stringify(state, null, 2);
export function importData(text) {
  const data = JSON.parse(text);
  if (!Array.isArray(data.lists) || !Array.isArray(data.tasks)) throw new Error('Not a todo backup file');
  commit({ ...empty(), ...data });
}
export function resetData() {
  const s = empty();
  s.lists.push(newList('My tasks', '#3949ab', 1, { seed: true }));
  commit(s);
}

// ---------- sync support (used by sync/engine.js) ----------
export const getState = () => state;
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const TABLES = ['lists', 'tasks', 'subtasks', 'activity'];
const WIRE_TYPE = { list: 'lists', task: 'tasks', subtask: 'subtasks', activity: 'activity' };
const TIME_FIELDS = {
  lists: ['updatedAt'],
  tasks: ['dueAt', 'followUpAt', 'remindAt', 'completedAt', 'updatedAt'],
  subtasks: ['updatedAt'],
  activity: ['at'],
};

/** Server timestamps may carry microseconds or no millis; the UI compares ISO strings, so normalise. */
function normalise(table, row) {
  const r = { ...row, dirty: false };
  for (const f of TIME_FIELDS[table]) if (r[f]) r[f] = new Date(r[f]).toISOString();
  return r;
}

/** Make every local row upload again (used when local data is adopted by a different account). */
export function markAllDirty() {
  const next = {};
  for (const t of TABLES) next[t] = state[t].map((r) => ({ ...r, dirty: true }));
  commit(next);
}

/** The first-run "My tasks" list is dropped when the account already has lists and it was never touched. */
export function dropUntouchedSeed() {
  const seed = state.lists.find((l) => l.seed && !l.deleted);
  if (!seed || state.tasks.some((t) => t.listId === seed.id)) return;
  commit({ lists: state.lists.filter((l) => l.id !== seed.id) });
}

function removeList(next, listId) {
  const taskIds = new Set(next.tasks.filter((t) => t.listId === listId).map((t) => t.id));
  next.lists = next.lists.filter((l) => l.id !== listId);
  next.tasks = next.tasks.filter((t) => !taskIds.has(t.id));
  next.subtasks = next.subtasks.filter((x) => !taskIds.has(x.taskId));
  next.activity = next.activity.filter((a) => !taskIds.has(a.taskId));
}
function removeTask(next, taskId) {
  next.tasks = next.tasks.filter((t) => t.id !== taskId);
  next.subtasks = next.subtasks.filter((x) => x.taskId !== taskId);
  next.activity = next.activity.filter((a) => a.taskId !== taskId);
}

/**
 * Fold one sync response into the local data, last-write-wins by updatedAt:
 *  1. rows that were pushed (and not edited since) become clean;
 *  2. rejected rows: take the server's copy, or drop the local row if the server will not show it to us;
 *  3. server rows replace local rows unless the local row is dirty and newer.
 * `sent` maps table -> Map(id -> updatedAt) for lists/tasks/subtasks and Set(id) for activity.
 */
export function applySync({ sent, changes, rejected, memberOf }) {
  const next = {};
  for (const t of TABLES) next[t] = state[t];
  for (const t of ['lists', 'tasks', 'subtasks']) {
    next[t] = next[t].map((r) => (r.dirty && sent[t].get(r.id) === r.updatedAt ? { ...r, dirty: false } : r));
  }
  next.activity = next.activity.map((a) => (sent.activity.has(a.id) ? { ...a, dirty: false } : a));

  const force = new Set();
  for (const rej of rejected) {
    const table = WIRE_TYPE[rej.type];
    if (!table || rej.reason === 'missing_parent') continue; // keep dirty; it is retried on the next sync
    if (rej.reason === 'invalid') {
      console.warn('Server rejected an invalid', rej.type, rej.id);
      next[table] = next[table].map((r) => (r.id === rej.id ? { ...r, dirty: false } : r));
    } else if ((changes[table] ?? []).some((r) => r.id === rej.id)) {
      force.add(`${table}:${rej.id}`);
    } else if (rej.type === 'list') removeList(next, rej.id);
    else if (rej.type === 'task') removeTask(next, rej.id);
    else next[table] = next[table].filter((r) => r.id !== rej.id);
  }

  for (const table of TABLES) {
    const rows = [...next[table]];
    const at = new Map(rows.map((r, i) => [r.id, i]));
    for (const raw of changes[table] ?? []) {
      const row = normalise(table, raw);
      const i = at.get(row.id);
      if (i === undefined) {
        at.set(row.id, rows.length);
        rows.push(row);
        continue;
      }
      const local = rows[i];
      const newer = table === 'activity' || Date.parse(row.updatedAt) > Date.parse(local.updatedAt);
      if (force.has(`${table}:${row.id}`) || !local.dirty || newer) rows[i] = row;
    }
    next[table] = rows;
  }
  // Lists shared with us that the server no longer lists (we were removed, or left): drop them locally.
  if (Array.isArray(memberOf)) {
    const keep = new Set(memberOf);
    for (const l of next.lists.filter((x) => x.role && x.role !== 'OWNER' && !keep.has(x.id))) removeList(next, l.id);
  }
  commit(next);
}
