package ca.antany.app.todo;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import ca.antany.app.todo.user.SignInNotAllowedException;
import ca.antany.app.todo.user.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.TestPropertySource;

/** With APP_ALLOWED_EMAILS set, strangers cannot create accounts, but invited people and listed emails can. */
@TestPropertySource(properties = "app.allowed-emails= Boss@Example.com , spouse@example.com ")
class AllowListTest extends IntegrationTestBase {
    @Autowired UserRepository users;

    @Test
    void onlyListedOrInvitedEmailsMayCreateAnAccount() {
        SignInNotAllowedException e = assertThrows(SignInNotAllowedException.class,
                () -> provisioning.provision("sub-stranger", "stranger@gmail.com", true, "Stranger"));
        assertEquals("not_allowed", e.getCode());

        provisioning.provision("sub-boss", "boss@example.com", true, "Boss");   // listed (case/space-insensitive)
        provisioning.provision("sub-spouse", "spouse@example.com", true, "Spouse");

        // an invited stranger already has a placeholder row, so they are let in
        users.insert(null, "guest@gmail.com", "guest@gmail.com");
        provisioning.provision("sub-guest", "guest@gmail.com", true, "Guest");
    }
}
