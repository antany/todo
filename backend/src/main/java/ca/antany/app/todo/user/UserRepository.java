package ca.antany.app.todo.user;

import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class UserRepository {
    private final JdbcClient jdbc;

    UserRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    private static final String COLUMNS = "select id, google_sub, email, username, display_name from app_user ";

    public Optional<AppUser> findById(UUID id) {
        return jdbc.sql(COLUMNS + "where id = :id").param("id", id).query(AppUser.class).optional();
    }

    public Optional<AppUser> findByGoogleSub(String googleSub) {
        return jdbc.sql(COLUMNS + "where google_sub = :sub").param("sub", googleSub).query(AppUser.class).optional();
    }

    public Optional<AppUser> findByEmailIgnoreCase(String email) {
        return jdbc.sql(COLUMNS + "where lower(email) = lower(:email)").param("email", email).query(AppUser.class).optional();
    }

    /** Creates a row; pass a null googleSub for a placeholder. */
    public AppUser insert(String googleSub, String email, String displayName) {
        UUID id = UUID.randomUUID();
        jdbc.sql("insert into app_user (id, google_sub, email, display_name) values (:id, :sub, :email, :name)")
            .param("id", id).param("sub", googleSub).param("email", email).param("name", displayName).update();
        return new AppUser(id, googleSub, email, null, displayName);
    }

    public Optional<AppUser> findByUsername(String username) {
        return jdbc.sql(COLUMNS + "where lower(username) = lower(:u)").param("u", username).query(AppUser.class).optional();
    }

    /** A password account together with its stored hash. */
    public record Credentials(AppUser user, String passwordHash) {}

    public Optional<Credentials> findCredentials(String username) {
        return jdbc.sql("select id, google_sub, email, username, display_name, password_hash from app_user where lower(username) = lower(:u)")
            .param("u", username)
            .query((rs, n) -> new Credentials(new AppUser(rs.getObject("id", UUID.class), rs.getString("google_sub"),
                    rs.getString("email"), rs.getString("username"), rs.getString("display_name")),
                    rs.getString("password_hash")))
            .optional();
    }

    public Optional<String> passwordHash(UUID id) {
        return jdbc.sql("select password_hash from app_user where id = :id and password_hash is not null")
            .param("id", id).query(String.class).optional();
    }

    /** Throws DuplicateKeyException if the username is taken. */
    public AppUser insertWithPassword(String username, String passwordHash) {
        UUID id = UUID.randomUUID();
        jdbc.sql("insert into app_user (id, username, password_hash, display_name) values (:id, :u, :h, :u)")
            .param("id", id).param("u", username).param("h", passwordHash).update();
        return new AppUser(id, null, null, username, username);
    }

    public void updatePasswordHash(UUID id, String passwordHash) {
        jdbc.sql("update app_user set password_hash = :h where id = :id").param("id", id).param("h", passwordHash).update();
    }

    public void updateProfile(UUID id, String email, String displayName) {
        jdbc.sql("update app_user set email = :email, display_name = :name where id = :id")
            .param("id", id).param("email", email).param("name", displayName).update();
    }

    public void linkGoogle(UUID id, String googleSub, String displayName) {
        jdbc.sql("update app_user set google_sub = :sub, display_name = :name where id = :id")
            .param("id", id).param("sub", googleSub).param("name", displayName).update();
    }
}
