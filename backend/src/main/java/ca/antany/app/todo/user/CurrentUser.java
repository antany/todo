package ca.antany.app.todo.user;

import java.security.Principal;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

/**
 * Resolves the signed-in person. A Google sign-in's principal name is the Google subject id; a password
 * sign-in's is {@link #PASSWORD_PREFIX} followed by the user id (Google subject ids are plain digits, so the
 * two cannot collide).
 */
@Component
public class CurrentUser {
    public static final String PASSWORD_PREFIX = "u:";

    private final UserRepository users;

    CurrentUser(UserRepository users) {
        this.users = users;
    }

    public AppUser get(Principal principal) {
        String name = principal.getName();
        // A live session whose user no longer exists (e.g. database wiped) must sign in again.
        return (name.startsWith(PASSWORD_PREFIX) ? findPasswordUser(name) : users.findByGoogleSub(name))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Please sign in again"));
    }

    private java.util.Optional<AppUser> findPasswordUser(String name) {
        try {
            return users.findById(UUID.fromString(name.substring(PASSWORD_PREFIX.length())));
        } catch (IllegalArgumentException e) {
            return java.util.Optional.empty();
        }
    }
}
