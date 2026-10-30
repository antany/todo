package ca.antany.app.todo.share;

import ca.antany.app.todo.share.ShareDtos.InvitationDto;
import ca.antany.app.todo.share.ShareDtos.MemberDto;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** All SQL for list membership. Changes that affect what a person can see also re-stamp seq (see bump). */
@Repository
class ShareRepository {
    private static final String NAME = "coalesce(u.display_name, u.username, u.email)";
    private static final String IDENTITY = "coalesce(u.email, u.username)";

    private final JdbcClient jdbc;

    ShareRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    MemberDto owner(UUID listId) {
        return jdbc.sql("select u.id, " + NAME + " as name, " + IDENTITY + " as identity from todo_list l join app_user u on u.id = l.owner_id where l.id = :l")
            .param("l", listId)
            .query((rs, n) -> new MemberDto(rs.getObject("id", UUID.class), rs.getString("name"), rs.getString("identity"), "OWNER", "ACCEPTED"))
            .single();
    }

    List<MemberDto> members(UUID listId, boolean includePending) {
        return jdbc.sql("select u.id, " + NAME + " as name, " + IDENTITY + " as identity, m.role, m.status from list_member m join app_user u on u.id = m.user_id where m.list_id = :l"
                + (includePending ? "" : " and m.status = 'ACCEPTED'") + " order by m.status, " + NAME)
            .param("l", listId)
            .query((rs, n) -> new MemberDto(rs.getObject("id", UUID.class), rs.getString("name"), rs.getString("identity"), rs.getString("role"), rs.getString("status")))
            .list();
    }

    int memberCount(UUID listId) {
        return jdbc.sql("select count(*) from list_member where list_id = :l").param("l", listId).query(Integer.class).single();
    }

    Optional<String> statusOf(UUID listId, UUID userId) {
        return jdbc.sql("select status from list_member where list_id = :l and user_id = :u")
            .param("l", listId).param("u", userId).query(String.class).optional();
    }

    /** A new member starts PENDING; an existing row keeps its status and only changes role. */
    void upsert(UUID listId, UUID userId, String role, UUID invitedBy) {
        jdbc.sql("""
                insert into list_member (list_id, user_id, role, status, invited_by) values (:l, :u, :r, 'PENDING', :by)
                on conflict (list_id, user_id) do update set role = excluded.role""")
            .param("l", listId).param("u", userId).param("r", role).param("by", invitedBy).update();
    }

    int setRole(UUID listId, UUID userId, String role) {
        return jdbc.sql("update list_member set role = :r where list_id = :l and user_id = :u")
            .param("l", listId).param("u", userId).param("r", role).update();
    }

    int remove(UUID listId, UUID userId) {
        return jdbc.sql("delete from list_member where list_id = :l and user_id = :u")
            .param("l", listId).param("u", userId).update();
    }

    int accept(UUID listId, UUID userId) {
        return jdbc.sql("update list_member set status = 'ACCEPTED' where list_id = :l and user_id = :u and status = 'PENDING'")
            .param("l", listId).param("u", userId).update();
    }

    int decline(UUID listId, UUID userId) {
        return jdbc.sql("delete from list_member where list_id = :l and user_id = :u and status = 'PENDING'")
            .param("l", listId).param("u", userId).update();
    }

    List<InvitationDto> pendingFor(UUID userId) {
        return jdbc.sql("""
                select l.id, l.name, l.color, m.role,
                       (select coalesce(i.display_name, i.username, i.email) from app_user i where i.id = m.invited_by) as invited_by
                from list_member m join todo_list l on l.id = m.list_id
                where m.user_id = :u and m.status = 'PENDING' and not l.deleted order by l.name""")
            .param("u", userId)
            .query((rs, n) -> new InvitationDto(rs.getObject("id", UUID.class), rs.getString("name"), rs.getString("color"),
                    rs.getString("invited_by"), rs.getString("role")))
            .list();
    }

    /**
     * Re-stamps the list and everything in it with fresh seq values (updated_at is untouched), so devices whose
     * cursor is already past those rows pull them again. Needed when someone gains access or their role changes.
     */
    void bump(UUID listId, boolean wholeList) {
        jdbc.sql("update todo_list set seq = nextval('change_seq') where id = :l").param("l", listId).update();
        if (!wholeList) return;
        jdbc.sql("update task set seq = nextval('change_seq') where list_id = :l").param("l", listId).update();
        jdbc.sql("update subtask set seq = nextval('change_seq') where task_id in (select id from task where list_id = :l)")
            .param("l", listId).update();
        jdbc.sql("update task_activity set seq = nextval('change_seq') where task_id in (select id from task where list_id = :l)")
            .param("l", listId).update();
    }
}
