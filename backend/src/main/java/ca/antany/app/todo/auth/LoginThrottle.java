package ca.antany.app.todo.auth;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

/**
 * Slows down password guessing: a key (a username or an IP address) that fails too often is blocked for the
 * rest of a 15-minute window. In memory, so it resets on restart; enough for a single-instance app.
 */
@Component
class LoginThrottle {
    private static final long WINDOW_MS = 15 * 60_000L;
    private static final int MAX_KEYS = 10_000;

    private record Window(int count, long start) {}

    private final Map<String, Window> windows = new ConcurrentHashMap<>();

    /** Throws 429 if this key has already used up its allowance. */
    void check(String key, int max) {
        Window w = windows.get(key);
        long now = System.currentTimeMillis();
        if (w != null && now - w.start < WINDOW_MS && w.count >= max) {
            long retry = (w.start + WINDOW_MS - now) / 1000 + 1;
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                    "Too many attempts. Try again in " + (retry / 60 + 1) + " minutes.");
        }
    }

    void hit(String key) {
        long now = System.currentTimeMillis();
        if (windows.size() > MAX_KEYS) windows.values().removeIf(w -> now - w.start >= WINDOW_MS);
        windows.compute(key, (k, w) -> w == null || now - w.start >= WINDOW_MS ? new Window(1, now) : new Window(w.count + 1, w.start));
    }

    void clear(String key) {
        windows.remove(key);
    }
}
