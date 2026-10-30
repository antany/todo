package ca.antany.app.todo.list;

import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * The single permission gate for lists and everything inside them. Only ACCEPTED members count; a pending
 * invitation grants nothing. The owner is implicit (todo_list.owner_id), only EDITOR/VIEWER rows live in
 * list_member.
 */
@Component
public class ListAccess {
    public enum Role {
        OWNER, EDITOR, VIEWER, NONE;

        public boolean canWrite() { return this == OWNER || this == EDITOR; }
        public boolean canRead() { return this != NONE; }
    }

    private final JdbcClient jdbc;

    ListAccess(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** Empty when the list does not exist; {@link Role#NONE} when it exists but this user has no access. */
    public Optional<Role> roleOf(UUID userId, UUID listId) {
        return jdbc.sql("""
                select case when l.owner_id = :u then 'OWNER'
                       else coalesce((select m.role from list_member m
                                      where m.list_id = l.id and m.user_id = :u and m.status = 'ACCEPTED'), 'NONE') end
                from todo_list l where l.id = :l""")
            .param("u", userId).param("l", listId)
            .query(String.class).optional().map(Role::valueOf);
    }
}
