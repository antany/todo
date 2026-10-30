import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, ApiError } from './api';

const CACHE_KEY = 'todo.me';

function cached() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY));
  } catch {
    return null;
  }
}
function remember(me) {
  try {
    if (me) localStorage.setItem(CACHE_KEY, JSON.stringify(me));
    else localStorage.removeItem(CACHE_KEY);
  } catch { /* storage blocked */ }
}

const Ctx = createContext({ me: null, ready: false, signOut: async () => {} });
export const useSession = () => useContext(Ctx);

/**
 * Who is signed in. The app never requires this: signed out it is a purely local app. The last known
 * account is cached so the app still looks signed in while offline; only a real 401 signs you out.
 */
export function SessionProvider({ children }) {
  const [me, setMe] = useState(cached);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const fresh = await api.get('/api/me');
      remember(fresh);
      setMe(fresh);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        remember(null);
        setMe(null);
      } // any other failure (offline, server down): keep what we know
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener('online', refresh);
    return () => window.removeEventListener('online', refresh);
  }, [refresh]);

  const signOut = useCallback(async () => {
    try {
      await api.logout();
    } catch { /* already signed out or offline */ }
    remember(null);
    setMe(null);
  }, []);

  const value = useMemo(() => ({ me, ready, signOut, refresh }), [me, ready, signOut, refresh]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
