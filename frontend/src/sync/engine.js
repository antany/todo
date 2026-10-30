import { api, ApiError } from '../api';
import { applySync, dropUntouchedSeed, getState, markAllDirty, resetData, subscribe, TABLES } from '../db/store';
import { useSyncExternalStore } from 'react';

/**
 * Keeps the local store and the server in step while someone is signed in. Every round trip pushes the dirty
 * rows and pulls everything newer than the cursor; conflicts are last-write-wins per row (see store.applySync).
 * Signed out, none of this runs and the app is purely local.
 */
const META_KEY = 'todo.sync';
const BATCH = 2000; // rows per table per request (the server accepts 5000)

function readMeta() {
  try {
    return { userId: null, cursor: 0, ...JSON.parse(localStorage.getItem(META_KEY)) };
  } catch {
    return { userId: null, cursor: 0 };
  }
}
function writeMeta(patch) {
  try {
    localStorage.setItem(META_KEY, JSON.stringify({ ...readMeta(), ...patch }));
  } catch { /* storage blocked */ }
}

// ---------- observable status ----------
// state: idle | syncing | offline | error | paused (waiting for an account decision)
let status = { state: 'idle', lastSyncAt: null, error: null };
const watchers = new Set();
function setStatus(patch) {
  status = { ...status, ...patch };
  watchers.forEach((w) => w());
}
export function useSyncStatus() {
  return useSyncExternalStore((cb) => { watchers.add(cb); return () => watchers.delete(cb); }, () => status);
}

// ---------- engine ----------
let me = null;
let onUnauthorized = () => {};
let running = false;
let again = false;
let applying = false;
let debounce = null;
let heartbeat = null;
let unsubscribe = null;

const hasDirty = () => TABLES.some((t) => getState()[t].some((r) => r.dirty));

function wire(row) {
  const { dirty, seed, ...rest } = row; // eslint-disable-line no-unused-vars
  return rest;
}

function snapshot() {
  const s = getState();
  const changes = {};
  const sent = {};
  let more = false;
  for (const t of TABLES) {
    const dirty = s[t].filter((r) => r.dirty);
    if (dirty.length > BATCH) more = true;
    const batch = dirty.slice(0, BATCH);
    changes[t] = batch.map(wire);
    sent[t] = t === 'activity' ? new Set(batch.map((r) => r.id)) : new Map(batch.map((r) => [r.id, r.updatedAt]));
  }
  return { changes, sent, more };
}

async function roundTrip(changes, sent) {
  const resp = await api.post('/api/sync', { cursor: readMeta().cursor, changes });
  applying = true;
  try {
    applySync({ sent, changes: resp.changes, rejected: resp.rejected ?? [], memberOf: resp.memberOf });
  } finally {
    applying = false;
  }
  writeMeta({ cursor: resp.cursor });
  return resp;
}

async function run() {
  if (!me || status.state === 'paused') return;
  if (running) {
    again = true;
    return;
  }
  if (!navigator.onLine) {
    setStatus({ state: 'offline' });
    return;
  }
  running = true;
  setStatus({ state: 'syncing', error: null });
  try {
    if (readMeta().cursor === 0) {
      // First sync of this account on this device: look at what the server has before uploading, so the
      // untouched starter list does not become a duplicate on every new device.
      const resp = await roundTrip(Object.fromEntries(TABLES.map((t) => [t, []])), emptySent());
      if (resp.changes.lists.length) dropUntouchedSeed();
    }
    let more;
    do {
      again = false;
      const snap = snapshot();
      await roundTrip(snap.changes, snap.sent);
      more = snap.more || (again && hasDirty());
    } while (more);
    setStatus({ state: 'idle', lastSyncAt: new Date().toISOString() });
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      setStatus({ state: 'idle' });
      onUnauthorized(); // the session ended: the session provider signs us out
    } else if (e instanceof ApiError) {
      setStatus({ state: 'error', error: e.message });
    } else {
      setStatus({ state: navigator.onLine ? 'error' : 'offline', error: 'Could not reach the server' });
    }
  } finally {
    running = false;
  }
}

const emptySent = () => ({ lists: new Map(), tasks: new Map(), subtasks: new Map(), activity: new Set() });

export const syncNow = () => run();

function schedule(ms = 2000) {
  clearTimeout(debounce);
  debounce = setTimeout(run, ms);
}

const onChange = () => {
  if (!applying && hasDirty()) schedule();
};
const onVisible = () => document.visibilityState === 'visible' && schedule(0);
const onOnline = () => schedule(0);
const onOffline = () => me && setStatus({ state: 'offline' });

/** Begin syncing for a signed-in user. Pauses if this device's data belongs to a different account. */
export function startSync(user, { unauthorized } = {}) {
  stopSync();
  me = user;
  onUnauthorized = unauthorized ?? (() => {});
  const meta = readMeta();
  if (!meta.userId) writeMeta({ userId: user.id, cursor: 0 });
  else if (meta.userId !== user.id) {
    setStatus({ state: 'paused' });
    return;
  }
  setStatus({ state: 'idle' });
  unsubscribe = subscribe(onChange);
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
  document.addEventListener('visibilitychange', onVisible);
  heartbeat = setInterval(run, 60_000);
  schedule(0);
}

export function stopSync() {
  me = null;
  clearTimeout(debounce);
  clearInterval(heartbeat);
  unsubscribe?.();
  unsubscribe = null;
  window.removeEventListener('online', onOnline);
  window.removeEventListener('offline', onOffline);
  document.removeEventListener('visibilitychange', onVisible);
  if (status.state !== 'paused') setStatus({ state: 'idle' });
}

/** The device holds another account's data: merge it into this account, or start with an empty device. */
export function adoptAccount(user, keepLocal, opts) {
  if (keepLocal) markAllDirty();
  else resetData();
  writeMeta({ userId: user.id, cursor: 0 });
  status = { ...status, state: 'idle' };
  startSync(user, opts);
}

export const deviceOwnedBy = () => readMeta().userId;
