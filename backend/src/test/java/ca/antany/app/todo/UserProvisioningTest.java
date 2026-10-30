package ca.antany.app.todo;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

import ca.antany.app.todo.user.AppUser;
import ca.antany.app.todo.user.SignInNotAllowedException;
import ca.antany.app.todo.user.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

class UserProvisioningTest extends IntegrationTestBase {
    @Autowired UserRepository users;

    @Test
    void firstSignInCreatesAnAccount() {
        AppUser u = provisioning.provision("sub-new1", " New1@Example.com ", true, "New One");
        assertEquals("new1@example.com", u.email());
        assertEquals(u.id(), users.findByGoogleSub("sub-new1").orElseThrow().id());
    }

    @Test
    void signingInAgainKeepsTheSameAccountAndRefreshesTheName() {
        AppUser first = provisioning.provision("sub-again", "again@example.com", true, "Old Name");
        AppUser second = provisioning.provision("sub-again", "again@example.com", true, "New Name");
        assertEquals(first.id(), second.id());
        assertEquals("New Name", users.findById(first.id()).orElseThrow().displayName());
    }

    @Test
    void emailChangedAtGoogleFollowsTheSameAccount() {
        AppUser first = provisioning.provision("sub-move", "before@example.com", true, "Mover");
        provisioning.provision("sub-move", "after@example.com", true, "Mover");
        assertEquals("after@example.com", users.findById(first.id()).orElseThrow().email());
    }

    @Test
    void unverifiedEmailIsRejected() {
        SignInNotAllowedException e = assertThrows(SignInNotAllowedException.class,
                () -> provisioning.provision("sub-unv", "unverified@example.com", false, "Nope"));
        assertEquals("email_not_verified", e.getCode());
        assertThrows(SignInNotAllowedException.class, () -> provisioning.provision("sub-null", null, true, "No email"));
    }

    @Test
    void anotherGoogleAccountCannotTakeOverAnExistingEmail() {
        provisioning.provision("sub-owner", "taken@example.com", true, "Owner");
        SignInNotAllowedException e = assertThrows(SignInNotAllowedException.class,
                () -> provisioning.provision("sub-impostor", "taken@example.com", true, "Impostor"));
        assertEquals("account_conflict", e.getCode());
    }

    @Test
    void placeholderIsClaimedByTheFirstVerifiedSignIn() {
        AppUser placeholder = users.insert(null, "friend@example.com", "friend@example.com");
        assertNull(users.findByEmailIgnoreCase("Friend@Example.com").orElseThrow().googleSub());
        AppUser claimed = provisioning.provision("sub-friend", "friend@example.com", true, "The Friend");
        assertEquals(placeholder.id(), claimed.id());
        assertEquals("The Friend", users.findById(placeholder.id()).orElseThrow().displayName());
        assertEquals("sub-friend", users.findById(placeholder.id()).orElseThrow().googleSub());
    }
}
