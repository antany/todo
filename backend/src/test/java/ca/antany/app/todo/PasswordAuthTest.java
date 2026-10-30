package ca.antany.app.todo;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.ResultActions;
import tools.jackson.databind.json.JsonMapper;

class PasswordAuthTest extends IntegrationTestBase {
    @Autowired JsonMapper json;
    @Autowired JdbcClient jdbc;

    static String uniq() { return UUID.randomUUID().toString().substring(0, 8); }

    ResultActions call(String path, Object body) throws Exception {
        return mvc.perform(post(path).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body)));
    }

    ResultActions call(String path, MockHttpSession s, Object body) throws Exception {
        return mvc.perform(post(path).session(s).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body)));
    }

    MockHttpSession sessionOf(ResultActions r) {
        return (MockHttpSession) r.andReturn().getRequest().getSession(false);
    }

    @Test
    void registeringCreatesAnAccountAndSignsIn() throws Exception {
        String u = "Ann_" + uniq();
        ResultActions r = call("/api/auth/register", Map.of("username", u, "password", "correct horse"))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.username").value(u.toLowerCase()))
            .andExpect(jsonPath("$.email").doesNotExist())
            .andExpect(jsonPath("$.passwordLogin").value(true));
        MockHttpSession s = sessionOf(r);
        mvc.perform(get("/api/me").session(s)).andExpect(status().isOk()).andExpect(jsonPath("$.displayName").value(u.toLowerCase()));
        // the account can use the API (sync) like a Google account
        mvc.perform(post("/api/sync").session(s).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().isOk());
    }

    @Test
    void onlyAUsernameAndAHashAreStored() throws Exception {
        String u = "hash" + uniq();
        call("/api/auth/register", Map.of("username", u, "password", "s3cret-pass")).andExpect(status().isCreated());
        Map<String, Object> row = jdbc.sql("select * from app_user where username = :u").param("u", u).query().singleRow();
        assertTrue(row.get("email") == null && row.get("google_sub") == null);
        String hash = (String) row.get("password_hash");
        assertTrue(hash.startsWith("{bcrypt}"), hash);
        assertFalse(hash.contains("s3cret-pass"));
    }

    @Test
    void usernamesAreCaseInsensitiveAndUnique() throws Exception {
        String u = "dup" + uniq();
        call("/api/auth/register", Map.of("username", u, "password", "password-1")).andExpect(status().isCreated());
        call("/api/auth/register", Map.of("username", u.toUpperCase(), "password", "password-2")).andExpect(status().isConflict());
    }

    @Test
    void badUsernamesAndPasswordsAreRejected() throws Exception {
        call("/api/auth/register", Map.of("username", "ab", "password", "password-1")).andExpect(status().isBadRequest());
        call("/api/auth/register", Map.of("username", "has space", "password", "password-1")).andExpect(status().isBadRequest());
        call("/api/auth/register", Map.of("username", "me@mail.com", "password", "password-1")).andExpect(status().isBadRequest());
        call("/api/auth/register", Map.of("username", "ok" + uniq(), "password", "short")).andExpect(status().isBadRequest());
        call("/api/auth/register", Map.of("username", "ok" + uniq(), "password", "x".repeat(73))).andExpect(status().isBadRequest());
        String same = "same" + uniq();
        call("/api/auth/register", Map.of("username", same, "password", same)).andExpect(status().isBadRequest());
    }

    @Test
    void loginWorksAndFailuresGiveOneGenericAnswer() throws Exception {
        String u = "login" + uniq();
        call("/api/auth/register", Map.of("username", u, "password", "right-password"));
        MockHttpSession s = sessionOf(call("/api/auth/login", Map.of("username", u.toUpperCase(), "password", "right-password")).andExpect(status().isOk()));
        mvc.perform(get("/api/me").session(s)).andExpect(status().isOk());
        call("/api/auth/login", Map.of("username", u, "password", "wrong-password"))
            .andExpect(status().isUnauthorized()).andExpect(status().reason("Wrong username or password"));
        call("/api/auth/login", Map.of("username", "nobody" + uniq(), "password", "wrong-password"))
            .andExpect(status().isUnauthorized()).andExpect(status().reason("Wrong username or password"));
    }

    @Test
    void googleOnlyAccountsCannotLogInWithAPassword() throws Exception {
        String name = "g" + uniq();
        signUp(name);
        call("/api/auth/login", Map.of("username", name, "password", "anything-here")).andExpect(status().isUnauthorized());
    }

    @Test
    void repeatedWrongPasswordsLockTheAccountTemporarily() throws Exception {
        String u = "lock" + uniq();
        call("/api/auth/register", Map.of("username", u, "password", "right-password"));
        for (int i = 0; i < 5; i++) {
            call("/api/auth/login", Map.of("username", u, "password", "nope-nope")).andExpect(status().isUnauthorized());
        }
        call("/api/auth/login", Map.of("username", u, "password", "right-password")).andExpect(status().isTooManyRequests());
    }

    @Test
    void changingThePasswordNeedsTheCurrentOne() throws Exception {
        String u = "chg" + uniq();
        MockHttpSession s = sessionOf(call("/api/auth/register", Map.of("username", u, "password", "old-password")));
        call("/api/auth/password", s, Map.of("currentPassword", "wrong-one", "newPassword", "new-password")).andExpect(status().isBadRequest());
        call("/api/auth/password", s, Map.of("currentPassword", "old-password", "newPassword", "short")).andExpect(status().isBadRequest());
        call("/api/auth/password", s, Map.of("currentPassword", "old-password", "newPassword", "new-password")).andExpect(status().isNoContent());
        call("/api/auth/login", Map.of("username", u, "password", "old-password")).andExpect(status().isUnauthorized());
        call("/api/auth/login", Map.of("username", u, "password", "new-password")).andExpect(status().isOk());
    }

    @Test
    void googleAccountsHaveNoPasswordToChange() throws Exception {
        MockHttpSession s = signUp("gc" + uniq());
        call("/api/auth/password", s, Map.of("currentPassword", "x", "newPassword", "new-password-1")).andExpect(status().isBadRequest());
    }

    @Test
    void loginNeedsACsrfTokenAndAnonymousCannotChangePasswords() throws Exception {
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isForbidden());
        call("/api/auth/password", Map.of("currentPassword", "x", "newPassword", "new-password-1")).andExpect(status().isUnauthorized());
    }

    @Test
    void optionsArePublic() throws Exception {
        mvc.perform(get("/api/auth/options")).andExpect(status().isOk())
            .andExpect(jsonPath("$.passwordSignup").value(true)).andExpect(jsonPath("$.google").value(false));
    }

    @Test
    void aPasswordSessionForADeletedUserMustSignInAgain() throws Exception {
        String u = "gone" + uniq();
        MockHttpSession s = sessionOf(call("/api/auth/register", Map.of("username", u, "password", "right-password")));
        jdbc.sql("delete from app_user where username = :u").param("u", u).update();
        mvc.perform(get("/api/me").session(s)).andExpect(status().isUnauthorized());
    }
}
