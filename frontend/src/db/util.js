export const uid = () =>
  globalThis.crypto?.randomUUID
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });

export const nowIso = () => new Date().toISOString();

const pad = (n) => String(n).padStart(2, '0');

/** ISO instant -> value for <input type="datetime-local"> (local time). */
export function toInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const fromInput = (v) => (v ? new Date(v).toISOString() : null);

export const startOfDay = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const endOfDay = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
export const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes());

/** Advance an ISO instant by one repeat period; month/year steps clamp to the end of the shorter month. */
export function addPeriod(iso, rule) {
  const d = new Date(iso);
  if (rule === 'DAILY') return addDays(d, 1).toISOString();
  if (rule === 'WEEKLY') return addDays(d, 7).toISOString();
  const months = rule === 'YEARLY' ? 12 : 1;
  const target = new Date(d.getFullYear(), d.getMonth() + months, 1, d.getHours(), d.getMinutes());
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(d.getDate(), last));
  return target.toISOString();
}

/** Quick date shortcuts used by the "Today / Tomorrow / Next week" chips. */
export function quickDate(kind) {
  const now = new Date();
  if (kind === 'today') {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 17, 0);
    return (d > now ? d : new Date(now.getTime() + 60 * 60 * 1000)).toISOString();
  }
  if (kind === 'tomorrow') return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9, 0).toISOString();
  const daysToMonday = ((8 - now.getDay()) % 7) || 7;
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysToMonday, 9, 0).toISOString();
}

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const dayYearFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

export function dayLabel(date) {
  const d = new Date(date);
  const diff = Math.round((startOfDay(d) - startOfDay()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return (d.getFullYear() === new Date().getFullYear() ? dayFmt : dayYearFmt).format(d);
}

export const formatWhen = (iso) => `${dayLabel(iso)}, ${timeFmt.format(new Date(iso))}`;
