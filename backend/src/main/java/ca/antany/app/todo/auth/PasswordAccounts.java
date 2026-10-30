package ca.antany.app.todo.auth;

import ca.antany.app.todo.user.AppUser;
import ca.antany.app.todo.user.UserRepository;
import ca.antany.app.todo.user.UserRepository.Credentials;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

/** Username + password accounts: nothing is stored but the username and a bcrypt hash of the password. */
@Service
class PasswordAccounts {
    private static final Pattern USERNAME = Pattern.compile("[a-z0-9][a-z0-9._-]{2,29}");
    private static final int MIN_PASSWORD = 8;
    private static final int MAX_PASSWORD_BYTES = 72; // bcrypt ignores (and Spring rejects) anything longer
    private static final int USER_FAILURES = 5;
    private static final int IP_FAILURES = 30;
    private static final int IP_SIGNUPS = 10;

    private final UserRepository users;
    private final PasswordEncoder encoder;
    private final LoginThrottle throttle;
    private final boolean signupOpen;
    /** Checked when the username does not exist, so a wrong username and a wrong password take equally long. */
    private final String dummyHash;

    PasswordAccounts(UserRepository users, PasswordEncoder encoder, LoginThrottle throttle,
                     @Value("${app.password-signup:true}") boolean signupOpen) {
        this.users = users;
        this.encoder = encoder;
        this.throttle = throttle;
        this.signupOpen = signupOpen;
        this.dummyHash = encoder.encode("not-a-real-password");
    }

    boolean signupOpen() { return signupOpen; }

    AppUser register(String rawUsername, String password, String ip) {
        if (!signupOpen) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Creating accounts is turned off");
        throttle.check("reg:" + ip, IP_SIGNUPS);
        String username = normalize(rawUsername);
        if (!USERNAME.matcher(username).matches()) {
            throw bad("Username must be 3 to 30 characters: letters, digits, dot, dash or underscore");
        }
        checkPassword(password, username);
        throttle.hit("reg:" + ip);
        try {
            return users.insertWithPassword(username, encoder.encode(password));
        } catch (DuplicateKeyException e) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "That username is taken");
        }
    }

    AppUser login(String rawUsername, String password, String ip) {
        String username = normalize(rawUsername);
        throttle.check("user:" + username, USER_FAILURES);
        throttle.check("ip:" + ip, IP_FAILURES);
        Credentials c = password == null || password.getBytes(StandardCharsets.UTF_8).length > MAX_PASSWORD_BYTES
                ? null : users.findCredentials(username).filter(x -> x.passwordHash() != null).orElse(null);
        boolean ok = encoder.matches(password == null ? "" : password, c == null ? dummyHash : c.passwordHash()) && c != null;
        if (!ok) {
            throttle.hit("user:" + username);
            throttle.hit("ip:" + ip);
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Wrong username or password");
        }
        throttle.clear("user:" + username);
        return c.user();
    }

    void changePassword(AppUser user, String current, String next) {
        String hash = users.passwordHash(user.id())
                .orElseThrow(() -> bad("This account signs in with Google and has no password"));
        throttle.check("user:" + user.username(), USER_FAILURES);
        if (current == null || !encoder.matches(current, hash)) {
            throttle.hit("user:" + user.username());
            throw bad("The current password is wrong");
        }
        checkPassword(next, user.username());
        users.updatePasswordHash(user.id(), encoder.encode(next));
        throttle.clear("user:" + user.username());
    }

    private static void checkPassword(String password, String username) {
        if (password == null || password.length() < MIN_PASSWORD) {
            throw bad("Password must be at least " + MIN_PASSWORD + " characters");
        }
        if (password.getBytes(StandardCharsets.UTF_8).length > MAX_PASSWORD_BYTES) throw bad("Password is too long");
        if (password.toLowerCase(Locale.ROOT).equals(username)) throw bad("Password must not be the same as the username");
    }

    private static String normalize(String username) {
        return username == null ? "" : username.trim().toLowerCase(Locale.ROOT);
    }

    private static ResponseStatusException bad(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }

}
