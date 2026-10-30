package ca.antany.app.todo.sync;

import ca.antany.app.todo.list.ListAccess;
import ca.antany.app.todo.list.ListAccess.Role;
import ca.antany.app.todo.sync.SyncDtos.ActivityDto;
import ca.antany.app.todo.sync.SyncDtos.Changes;
import ca.antany.app.todo.sync.SyncDtos.ListDto;
import ca.antany.app.todo.sync.SyncDtos.Rejected;
import ca.antany.app.todo.sync.SyncDtos.SubtaskDto;
import ca.antany.app.todo.sync.SyncDtos.SyncRequest;
import ca.antany.app.todo.sync.SyncDtos.SyncResponse;
import ca.antany.app.todo.sync.SyncDtos.TaskDto;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Offline-first sync. A client pushes the rows it changed and pulls everything newer than its cursor in one
 * round trip. Conflict rule: last write wins per row by the client's updatedAt (clamped to now + 5 min); a tie keeps
 * the server's row. Deletes are tombstones, so they win only when newer. When a pushed row loses or is rejected,
 * the server's current row is returned so the client converges.
 */
@Service
@Transactional
public class SyncService {
    private static final int MAX_ROWS = 5000;
    private static final Duration MAX_CLOCK_AHEAD = Duration.ofMinutes(5);
    private static final Set<String> REPEATS = Set.of("NONE", "DAILY", "WEEKLY", "MONTHLY", "YEARLY");
    private static final Set<String> STATUSES = Set.of("TODO", "IN_PROGRESS", "WAITING", "DONE");

    private final SyncRepository repo;
    private final ListAccess access;

    SyncService(SyncRepository repo, ListAccess access) {
        this.repo = repo;
        this.access = access;
    }

    public SyncResponse sync(UUID user, SyncRequest req) {
        var in = req.changes() == null ? new Changes(null, null, null, null) : req.changes();
        if (in.lists().size() > MAX_ROWS || in.tasks().size() > MAX_ROWS
                || in.subtasks().size() > MAX_ROWS || in.activity().size() > MAX_ROWS) {
            throw new ResponseStatusException(HttpStatus.CONTENT_TOO_LARGE, "Too many changes in one request");
        }
        long cursor = req.cursor() == null ? 0 : Math.max(0, req.cursor());
        repo.lock();
        Instant latest = Instant.now().plus(MAX_CLOCK_AHEAD);

        List<Rejected> rejected = new ArrayList<>();
        Set<UUID> echoLists = new LinkedHashSet<>();
        Set<UUID> echoTasks = new LinkedHashSet<>();
        Set<UUID> echoSubs = new LinkedHashSet<>();

        for (ListDto d : in.lists()) pushList(user, d, latest, rejected, echoLists);
        for (TaskDto d : in.tasks()) pushTask(user, d, latest, rejected, echoTasks);
        for (SubtaskDto d : in.subtasks()) pushSubtask(user, d, latest, rejected, echoSubs);
        for (ActivityDto d : in.activity()) pushActivity(user, d, rejected);

        // Pull: everything visible and newer than the cursor, plus the server's version of rows that lost.
        Map<UUID, ListDto> lists = new HashMap<>();
        Map<UUID, TaskDto> tasks = new HashMap<>();
        Map<UUID, SubtaskDto> subs = new HashMap<>();
        repo.listsSince(user, cursor).forEach(r -> lists.put(r.id(), r));
        repo.tasksSince(user, cursor).forEach(r -> tasks.put(r.id(), r));
        repo.subtasksSince(user, cursor).forEach(r -> subs.put(r.id(), r));
        repo.listsByIds(user, echoLists).forEach(r -> lists.put(r.id(), r));
        repo.tasksByIds(user, echoTasks).forEach(r -> tasks.put(r.id(), r));
        repo.subtasksByIds(user, echoSubs).forEach(r -> subs.put(r.id(), r));
        List<ActivityDto> activity = repo.activitySince(user, cursor);

        return new SyncResponse(repo.currentSeq(),
                new Changes(List.copyOf(lists.values()), List.copyOf(tasks.values()), List.copyOf(subs.values()), activity),
                rejected, repo.sharedListIds(user));
    }

    // ---------- push ----------
    private void pushList(UUID user, ListDto d, Instant latest, List<Rejected> rej, Set<UUID> echo) {
        if (d.id() == null || blank(d.name(), 200) || bad(d.position()) || d.updatedAt() == null) {
            rej.add(new Rejected("list", d.id(), "invalid"));
            return;
        }
        Optional<Role> role = access.roleOf(user, d.id());
        if (role.isPresent() && role.get() != Role.OWNER) { // only the owner may rename, recolour, archive or delete
            rej.add(new Rejected("list", d.id(), "forbidden"));
            echo.add(d.id());
            return;
        }
        ListDto clean = new ListDto(d.id(), user, d.name().trim(), d.color(), d.position(), flag(d.archived()),
                flag(d.deleted()), null, null, null);
        if (repo.upsertList(user, clean, clamp(d.updatedAt(), latest)) == 0) echo.add(d.id());
    }

    private void pushTask(UUID user, TaskDto d, Instant latest, List<Rejected> rej, Set<UUID> echo) {
        if (d.id() == null || d.listId() == null || blank(d.title(), 500) || d.updatedAt() == null
                || d.priority() == null || d.priority() < 0 || d.priority() > 3 || bad(d.position())
                || !REPEATS.contains(d.repeatRule()) || !STATUSES.contains(d.status())
                || (d.notes() != null && d.notes().length() > 20_000) || badTags(d.tags())) {
            rej.add(new Rejected("task", d.id(), "invalid"));
            return;
        }
        Optional<UUID> currentList = repo.taskListId(d.id());
        if (currentList.isPresent() && !canWrite(user, currentList.get())) {
            rej.add(new Rejected("task", d.id(), "forbidden"));
            echo.add(d.id());
            return;
        }
        Optional<Role> target = access.roleOf(user, d.listId());
        if (target.isEmpty()) {
            rej.add(new Rejected("task", d.id(), "missing_parent"));
            return;
        }
        if (!target.get().canWrite()) {
            rej.add(new Rejected("task", d.id(), "forbidden"));
            echo.add(d.id());
            return;
        }
        TaskDto clean = new TaskDto(d.id(), d.listId(), d.title().trim(), d.notes() == null ? "" : d.notes(),
                d.priority(), d.dueAt(), d.followUpAt(), d.remindAt(), d.repeatRule(), d.status(), d.completedAt(),
                d.position(), d.tags() == null ? List.of() : d.tags(), flag(d.deleted()), null);
        if (repo.upsertTask(user, clean, clamp(d.updatedAt(), latest)) == 0) echo.add(d.id());
    }

    private void pushSubtask(UUID user, SubtaskDto d, Instant latest, List<Rejected> rej, Set<UUID> echo) {
        if (d.id() == null || d.taskId() == null || blank(d.title(), 500) || bad(d.position()) || d.updatedAt() == null) {
            rej.add(new Rejected("subtask", d.id(), "invalid"));
            return;
        }
        Optional<UUID> list = repo.taskListId(d.taskId());
        if (list.isEmpty()) {
            rej.add(new Rejected("subtask", d.id(), "missing_parent"));
            return;
        }
        if (!canWrite(user, list.get())) {
            rej.add(new Rejected("subtask", d.id(), "forbidden"));
            echo.add(d.id());
            return;
        }
        SubtaskDto clean = new SubtaskDto(d.id(), d.taskId(), d.title().trim(), flag(d.done()), d.position(),
                flag(d.deleted()), null);
        if (repo.upsertSubtask(clean, clamp(d.updatedAt(), latest)) == 0) echo.add(d.id());
    }

    private void pushActivity(UUID user, ActivityDto d, List<Rejected> rej) {
        if (d.id() == null || d.taskId() == null || blank(d.kind(), 50) || d.at() == null
                || (d.detail() != null && d.detail().toString().length() > 4000)) {
            rej.add(new Rejected("activity", d.id(), "invalid"));
            return;
        }
        Optional<UUID> list = repo.taskListId(d.taskId());
        if (list.isEmpty()) {
            rej.add(new Rejected("activity", d.id(), "missing_parent"));
            return;
        }
        if (!canWrite(user, list.get())) {
            rej.add(new Rejected("activity", d.id(), "forbidden"));
            return;
        }
        repo.insertActivity(user, d, d.at().truncatedTo(ChronoUnit.MILLIS));
    }

    // ---------- helpers ----------
    private boolean canWrite(UUID user, UUID listId) {
        return access.roleOf(user, listId).map(Role::canWrite).orElse(false);
    }

    private static Instant clamp(Instant t, Instant latest) {
        Instant ms = t.truncatedTo(ChronoUnit.MILLIS);
        return ms.isAfter(latest) ? latest.truncatedTo(ChronoUnit.MILLIS) : ms;
    }

    private static boolean flag(Boolean b) { return b != null && b; }
    private static boolean bad(Double d) { return d == null || d.isNaN() || d.isInfinite(); }
    private static boolean blank(String s, int max) { return s == null || s.isBlank() || s.length() > max; }

    private static boolean badTags(List<String> tags) {
        return tags != null && (tags.size() > 30 || tags.stream().anyMatch(t -> t == null || t.isBlank() || t.length() > 50));
    }
}
