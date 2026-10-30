package ca.antany.app.todo.auth;

import ca.antany.app.todo.user.AppUser;
import ca.antany.app.todo.user.CurrentUser;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.security.Principal;
import java.util.List;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class AuthController {
    public record MeResponse(UUID id, String email, String username, String displayName, boolean passwordLogin) {}
    public record Options(boolean google, boolean passwordSignup) {}
    public record LoginRequest(String username, String password) {}
    public record PasswordChange(String currentPassword, String newPassword) {}

    private final CurrentUser currentUser;
    private final PasswordAccounts accounts;
    private final String googleClientId;
    private final HttpSessionSecurityContextRepository contexts = new HttpSessionSecurityContextRepository();

    AuthController(CurrentUser currentUser, PasswordAccounts accounts,
                   @Value("${spring.security.oauth2.client.registration.google.client-id}") String googleClientId) {
        this.currentUser = currentUser;
        this.accounts = accounts;
        this.googleClientId = googleClientId;
    }

    @GetMapping("/me")
    public MeResponse me(Principal principal) {
        return toMe(currentUser.get(principal));
    }

    /** Which sign-in methods the login page should offer. Public. */
    @GetMapping("/auth/options")
    public Options options() {
        return new Options(!googleClientId.isBlank() && !"not-configured".equals(googleClientId), accounts.signupOpen());
    }

    @PostMapping("/auth/register")
    public ResponseEntity<MeResponse> register(@RequestBody LoginRequest body, HttpServletRequest req, HttpServletResponse res) {
        AppUser user = accounts.register(body.username(), body.password(), req.getRemoteAddr());
        signIn(user, req, res);
        return ResponseEntity.status(HttpStatus.CREATED).body(toMe(user));
    }

    @PostMapping("/auth/login")
    public MeResponse login(@RequestBody LoginRequest body, HttpServletRequest req, HttpServletResponse res) {
        AppUser user = accounts.login(body.username(), body.password(), req.getRemoteAddr());
        signIn(user, req, res);
        return toMe(user);
    }

    @PostMapping("/auth/password")
    public ResponseEntity<Void> changePassword(@RequestBody PasswordChange body, Principal principal) {
        accounts.changePassword(currentUser.get(principal), body.currentPassword(), body.newPassword());
        return ResponseEntity.noContent().build();
    }

    private void signIn(AppUser user, HttpServletRequest req, HttpServletResponse res) {
        if (req.getSession(false) != null) req.changeSessionId(); // no session fixation
        var auth = UsernamePasswordAuthenticationToken.authenticated(CurrentUser.PASSWORD_PREFIX + user.id(), null,
                List.of(new SimpleGrantedAuthority("ROLE_USER")));
        SecurityContext ctx = SecurityContextHolder.createEmptyContext();
        ctx.setAuthentication(auth);
        SecurityContextHolder.setContext(ctx);
        contexts.saveContext(ctx, req, res);
    }

    private static MeResponse toMe(AppUser u) {
        return new MeResponse(u.id(), u.email(), u.username(), u.displayName(), u.username() != null);
    }
}
