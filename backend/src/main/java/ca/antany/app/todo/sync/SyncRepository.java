package ca.antany.app.todo.sync;

import ca.antany.app.todo.sync.SyncDtos.ActivityDto;
import ca.antany.app.todo.sync.SyncDtos.ListDto;
import ca.antany.app.todo.sync.SyncDtos.SubtaskDto;
import ca.antany.app.todo.sync.SyncDtos.TaskDto;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import tools.jackson.databind.json.JsonMapper;

/** All SQL for sync. Writes are last-write-wins on updated_at; every write takes a fresh change_seq. */
@Repository
public class SyncRepository {
    private static final long LOCK_KEY = 7_411_001L;
    private static final String SEQ = "nextval('change_seq')";

    /** A list the user owns, or is an accepted member of. */
    private static final String VISIBLE = """
            (l.owner_id = :u or exists (select 1 from list_member m
                                        where m.list_id = l.id and m.user_id = :u and m.status = 'ACCEPTED'))""";

    private final JdbcClient jdbc;
    private final JsonMapper json;

    SyncRepository(JdbcClient jdbc, JsonMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    /**
     * Serialises sync transactions, so change_seq order equals commit order and a client's cursor can never skip
     * a row that commits late. Anything else that changes synced rows must take this lock too.
     */
    public void lock() {
        jdbc.sql("select pg_advisory_xact_lock(:k)").param("k", LOCK_KEY).query().singleValue();
    }

    long currentSeq() {
        return jdbc.sql("select case when is_called then last_value else 0 end from change_seq")
            .query(Long.class).single();
    }

    // ---------- helpers ----------
    private static OffsetDateTime ts(Instant i) {
        return i == null ? null : i.atOffset(ZoneOffset.UTC);
    }

    private static Instant instant(ResultSet rs, String col) throws SQLException {
        OffsetDateTime t = rs.getObject(col, OffsetDateTime.class);
        return t == null ? null : t.toInstant();
    }

    private String toJson(Object o) {
        return json.writeValueAsString(o);
    }

    // ---------- lookups for access checks ----------
    Optional<UUID> taskListId(UUID taskId) {
        return jdbc.sql("select list_id from task where id = :id").param("id", taskId).query(UUID.class).optional();
    }

    // ---------- writes (return affected rows: 0 = an equal-or-newer version already exists) ----------
    int upsertList(UUID owner, ListDto d, Instant updatedAt) {
        return jdbc.sql("""
                insert into todo_list (id, owner_id, name, color, position, archived, deleted, updated_at)
                values (:id, :owner, :name, :color, :position, :archived, :deleted, :ts)
                on conflict (id) do update set name = excluded.name, color = excluded.color,
                    position = excluded.position, archived = excluded.archived, deleted = excluded.deleted,
                    updated_at = excluded.updated_at, seq = %s
                where todo_list.updated_at < excluded.updated_at""".formatted(SEQ))
            .param("id", d.id()).param("owner", owner).param("name", d.name()).param("color", d.color())
            .param("position", d.position()).param("archived", d.archived()).param("deleted", d.deleted())
            .param("ts", ts(updatedAt)).update();
    }

    int upsertTask(UUID user, TaskDto d, Instant updatedAt) {
        return jdbc.sql("""
                insert into task (id, list_id, title, notes, priority, due_at, follow_up_at, remind_at, repeat_rule,
                                  status, completed_at, position, tags, deleted, updated_at, updated_by)
                values (:id, :list, :title, :notes, :priority, :due, :follow, :remind, :repeat, :status, :completed,
                        :position, array(select jsonb_array_elements_text(cast(:tags as jsonb))), :deleted, :ts, :user)
                on conflict (id) do update set list_id = excluded.list_id, title = excluded.title,
                    notes = excluded.notes, priority = excluded.priority, due_at = excluded.due_at,
                    follow_up_at = excluded.follow_up_at, remind_at = excluded.remind_at,
                    repeat_rule = excluded.repeat_rule, status = excluded.status,
                    completed_at = excluded.completed_at, position = excluded.position, tags = excluded.tags,
                    deleted = excluded.deleted, updated_at = excluded.updated_at, updated_by = excluded.updated_by,
                    seq = %s
                where task.updated_at < excluded.updated_at""".formatted(SEQ))
            .param("id", d.id()).param("list", d.listId()).param("title", d.title()).param("notes", d.notes())
            .param("priority", d.priority()).param("due", ts(d.dueAt())).param("follow", ts(d.followUpAt()))
            .param("remind", ts(d.remindAt())).param("repeat", d.repeatRule()).param("status", d.status())
            .param("completed", ts(d.completedAt())).param("position", d.position())
            .param("tags", toJson(d.tags())).param("deleted", d.deleted()).param("ts", ts(updatedAt))
            .param("user", user).update();
    }

    int upsertSubtask(SubtaskDto d, Instant updatedAt) {
        return jdbc.sql("""
                insert into subtask (id, task_id, title, done, position, deleted, updated_at)
                values (:id, :task, :title, :done, :position, :deleted, :ts)
                on conflict (id) do update set title = excluded.title, done = excluded.done,
                    position = excluded.position, deleted = excluded.deleted,
                    updated_at = excluded.updated_at, seq = %s
                where subtask.updated_at < excluded.updated_at""".formatted(SEQ))
            .param("id", d.id()).param("task", d.taskId()).param("title", d.title()).param("done", d.done())
            .param("position", d.position()).param("deleted", d.deleted()).param("ts", ts(updatedAt)).update();
    }

    /** Append-only: an id that already exists is left alone. */
    int insertActivity(UUID actor, ActivityDto d, Instant at) {
        return jdbc.sql("""
                insert into task_activity (id, task_id, actor_id, kind, detail, at)
                values (:id, :task, :actor, :kind, cast(:detail as jsonb), :at)
                on conflict (id) do nothing""")
            .param("id", d.id()).param("task", d.taskId()).param("actor", actor).param("kind", d.kind())
            .param("detail", toJson(d.detail() == null ? Map.of() : d.detail())).param("at", ts(at)).update();
    }

    // ---------- reads (always limited to what the user may see) ----------
    private static final String LIST_COLS = """
            l.id, l.owner_id, l.name, l.color, l.position, l.archived, l.deleted, l.updated_at,
            case when l.owner_id = :u then 'OWNER'
                 else (select m.role from list_member m where m.list_id = l.id and m.user_id = :u and m.status = 'ACCEPTED') end as role,
            (select coalesce(o.display_name, o.username, o.email) from app_user o where o.id = l.owner_id) as owner_name""";
    private static final String TASK_COLS = """
            t.id, t.list_id, t.title, t.notes, t.priority, t.due_at, t.follow_up_at, t.remind_at, t.repeat_rule,
            t.status, t.completed_at, t.position, t.tags, t.deleted, t.updated_at""";

    private final RowMapper<ListDto> listRow = (rs, n) -> new ListDto(rs.getObject("id", UUID.class),
            rs.getObject("owner_id", UUID.class), rs.getString("name"), rs.getString("color"), rs.getDouble("position"),
            rs.getBoolean("archived"), rs.getBoolean("deleted"), instant(rs, "updated_at"), rs.getString("role"),
            rs.getString("owner_name"));

    private final RowMapper<TaskDto> taskRow = (rs, n) -> new TaskDto(rs.getObject("id", UUID.class),
            rs.getObject("list_id", UUID.class), rs.getString("title"), rs.getString("notes"), rs.getInt("priority"),
            instant(rs, "due_at"), instant(rs, "follow_up_at"), instant(rs, "remind_at"), rs.getString("repeat_rule"),
            rs.getString("status"), instant(rs, "completed_at"), rs.getDouble("position"),
            List.of((String[]) rs.getArray("tags").getArray()), rs.getBoolean("deleted"), instant(rs, "updated_at"));

    private final RowMapper<SubtaskDto> subtaskRow = (rs, n) -> new SubtaskDto(rs.getObject("id", UUID.class),
            rs.getObject("task_id", UUID.class), rs.getString("title"), rs.getBoolean("done"), rs.getDouble("position"),
            rs.getBoolean("deleted"), instant(rs, "updated_at"));

    @SuppressWarnings("unchecked")
    private ActivityDto activityRow(ResultSet rs, int n) throws SQLException {
        return new ActivityDto(rs.getObject("id", UUID.class), rs.getObject("task_id", UUID.class),
                rs.getObject("actor_id", UUID.class), rs.getString("kind"),
                json.readValue(rs.getString("detail"), Map.class), instant(rs, "at"));
    }

    private static final String TASK_FROM = " from task t join todo_list l on l.id = t.list_id where " + VISIBLE;
    private static final String SUB_FROM = " from subtask s join task t on t.id = s.task_id join todo_list l on l.id = t.list_id where " + VISIBLE;
    private static final String ACT_FROM = " from task_activity a join task t on t.id = a.task_id join todo_list l on l.id = t.list_id where " + VISIBLE;
    private static final String SUB_COLS = "s.id, s.task_id, s.title, s.done, s.position, s.deleted, s.updated_at";
    private static final String ACT_COLS = "a.id, a.task_id, a.actor_id, a.kind, a.detail::text as detail, a.at";

    /** Lists someone else owns that this user has accepted. */
    List<UUID> sharedListIds(UUID u) {
        return jdbc.sql("select list_id from list_member where user_id = :u and status = 'ACCEPTED'")
            .param("u", u).query(UUID.class).list();
    }

    List<ListDto> listsSince(UUID u, long cursor) {
        return jdbc.sql("select " + LIST_COLS + " from todo_list l where " + VISIBLE + " and l.seq > :c order by l.seq")
            .param("u", u).param("c", cursor).query(listRow).list();
    }
    List<TaskDto> tasksSince(UUID u, long cursor) {
        return jdbc.sql("select " + TASK_COLS + TASK_FROM + " and t.seq > :c order by t.seq")
            .param("u", u).param("c", cursor).query(taskRow).list();
    }
    List<SubtaskDto> subtasksSince(UUID u, long cursor) {
        return jdbc.sql("select " + SUB_COLS + SUB_FROM + " and s.seq > :c order by s.seq")
            .param("u", u).param("c", cursor).query(subtaskRow).list();
    }
    List<ActivityDto> activitySince(UUID u, long cursor) {
        return jdbc.sql("select " + ACT_COLS + ACT_FROM + " and a.seq > :c order by a.seq")
            .param("u", u).param("c", cursor).query(this::activityRow).list();
    }

    List<ListDto> listsByIds(UUID u, Collection<UUID> ids) {
        if (ids.isEmpty()) return List.of();
        return jdbc.sql("select " + LIST_COLS + " from todo_list l where " + VISIBLE + " and l.id in (:ids)")
            .param("u", u).param("ids", ids).query(listRow).list();
    }
    List<TaskDto> tasksByIds(UUID u, Collection<UUID> ids) {
        if (ids.isEmpty()) return List.of();
        return jdbc.sql("select " + TASK_COLS + TASK_FROM + " and t.id in (:ids)")
            .param("u", u).param("ids", ids).query(taskRow).list();
    }
    List<SubtaskDto> subtasksByIds(UUID u, Collection<UUID> ids) {
        if (ids.isEmpty()) return List.of();
        return jdbc.sql("select " + SUB_COLS + SUB_FROM + " and s.id in (:ids)")
            .param("u", u).param("ids", ids).query(subtaskRow).list();
    }
}
