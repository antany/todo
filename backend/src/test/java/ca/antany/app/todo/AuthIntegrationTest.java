package ca.antany.app.todo;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpSession;

class AuthIntegrationTest extends IntegrationTestBase {
    @Test
    void signedInUserSeesTheirProfile() throws Exception {
        MockHttpSession session = signIn("Alice@Example.com", "sub-alice", "Alice Smith");
        mvc.perform(get("/api/me").session(session))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.email").value("alice@example.com"))
            .andExpect(jsonPath("$.displayName").value("Alice Smith"))
            .andExpect(jsonPath("$.id").isNotEmpty());
    }

    @Test
    void anonymousApiAccessIsUnauthorized() throws Exception {
        mvc.perform(get("/api/me")).andExpect(status().isUnauthorized());
    }

    @Test
    void googleSignInLinkRedirectsToGoogle() throws Exception {
        String location = mvc.perform(get("/oauth2/authorization/google"))
            .andExpect(status().is3xxRedirection())
            .andReturn().getResponse().getRedirectedUrl();
        assertTrue(location.startsWith("https://accounts.google.com/o/oauth2/v2/auth"), location);
        assertTrue(location.contains("scope=openid%20profile%20email"), location);
        assertTrue(location.contains("redirect_uri="), location);
    }

    @Test
    void sessionForAnUnknownUserMustSignInAgain() throws Exception {
        // e.g. the database was wiped while a browser still held its session cookie
        mvc.perform(get("/api/me").session(sessionFor("sub-ghost", "ghost@example.com")))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void logoutEndsTheSession() throws Exception {
        MockHttpSession session = signUp("bye1");
        mvc.perform(post("/api/auth/logout").session(session).with(csrf())).andExpect(status().isOk());
        mvc.perform(get("/api/me").session(session)).andExpect(status().isUnauthorized());
    }

    @Test
    void stateChangingRequestsNeedACsrfToken() throws Exception {
        MockHttpSession session = signUp("csrf1");
        mvc.perform(post("/api/auth/logout").session(session)).andExpect(status().isForbidden());
    }

    @Test
    void csrfCookieIsHandedOutForTheSpaToEcho() throws Exception {
        mvc.perform(get("/api/me")).andExpect(cookie().exists("XSRF-TOKEN"));
    }
}
