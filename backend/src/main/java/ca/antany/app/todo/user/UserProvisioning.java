package ca.antany.app.todo.user;

import java.util.Arrays;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Creates or links the local account on every Google sign-in.
 *
 * <ul>
 *   <li>Only Google-verified emails are accepted.</li>
 *   <li>A person invited before ever signing in already has a placeholder row (same email): it is linked, so
 *       their pending invitations are waiting for them.</li>
 *   <li>A brand-new person may only create an account if {@code app.allowed-emails} is empty (open) or lists
 *       their email. People who were invited are always allowed.</li>
 * </ul>
 */
@Service
@Transactional
public class UserProvisioning {
    private final UserRepository users;
    private final Set<String> allowedEmails;

    UserProvisioning(UserRepository users, @Value("${app.allowed-emails:}") String allowedEmails) {
        this.users = users;
        this.allowedEmails = Arrays.stream(allowedEmails.split(","))
                .map(UserProvisioning::normalize).filter(e -> !e.isEmpty()).collect(Collectors.toSet());
    }

    public AppUser provision(String googleSub, String rawEmail, boolean emailVerified, String rawName) {
        String email = normalize(rawEmail);
        if (email.isEmpty() || !emailVerified) {
            throw new SignInNotAllowedException("email_not_verified", "Your Google email address is not verified");
        }
        String name = rawName == null || rawName.isBlank() ? email : rawName.trim();

        AppUser known = users.findByGoogleSub(googleSub).orElse(null);
        if (known != null) {
            // Google is the source of truth for name and email; keep ours in step (unless the email is taken).
            boolean emailTaken = users.findByEmailIgnoreCase(email).filter(u -> !u.id().equals(known.id())).isPresent();
            String newEmail = emailTaken ? known.email() : email;
            users.updateProfile(known.id(), newEmail, name);
            return new AppUser(known.id(), googleSub, newEmail, known.username(), name);
        }
        AppUser user = users.findByEmailIgnoreCase(email).orElse(null);
        if (user != null && user.googleSub() != null) {
            throw new SignInNotAllowedException("account_conflict", "This email belongs to a different Google account");
        }
        if (user == null) {
            if (!allowedEmails.isEmpty() && !allowedEmails.contains(email)) {
                throw new SignInNotAllowedException("not_allowed", "This email is not allowed to sign up here");
            }
            return users.insert(googleSub, email, name);
        }
        users.linkGoogle(user.id(), googleSub, name);
        return new AppUser(user.id(), googleSub, user.email(), user.username(), name);
    }

    static String normalize(String email) {
        return email == null ? "" : email.trim().toLowerCase(Locale.ROOT);
    }
}
