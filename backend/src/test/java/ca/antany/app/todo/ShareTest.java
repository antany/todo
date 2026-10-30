package ca.antany.app.todo;

import static ca.antany.app.todo.SyncTest.NOTHING;
import static ca.antany.app.todo.SyncTest.byId;
import static ca.antany.app.todo.SyncTest.changes;
import static ca.antany.app.todo.SyncTest.cursor;
import static ca.antany.app.todo.SyncTest.list;
import static ca.antany.app.todo.SyncTest.rejected;
import static ca.antany.app.todo.SyncTest.rows;
import static ca.antany.app.todo.SyncTest.task;
import static ca.antany.app.todo.SyncTest.uniq;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.ResultActions;
import tools.jackson.databind.json.JsonMapper;

class ShareTest extends IntegrationTestBase {
    @Autowired JsonMapper json;

    ResultActions send(org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder b, MockHttpSession s, Object body) throws Exception {
        b = b.session(s).with(csrf());
        if (body != null) b = b.contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body));
        return mvc.perform(b);
    }

    String sync(MockHttpSession s, long cursor, Map<String, Object> ch) throws Exception {
        return send(post("/api/sync"), s, Map.of("cursor", cursor, "changes", ch)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
    }

    ResultActions invite(MockHttpSession owner, UUID list, String identity, String role) throws Exception {
        return send(post("/api/lists/" + list + "/members"), owner, Map.of("identity", identity, "role", role));
    }


    @Autowired org.springframework.jdbc.core.simple.JdbcClient jdbc;
    UUID jdbcUser(String name) {
        return jdbc.sql("select id from app_user where google_sub = :s").param("s", "sub-" + name).query(UUID.class).single();
    }

    /** Owner creates a list with one task and syncs it. */
    UUID listWithTask(MockHttpSession owner, UUID task) throws Exception {
        UUID l = UUID.randomUUID();
        String body = sync(owner, 0, changes(List.of(list(l, "Shared", 5)), List.of(task(task, l, "Milk", 6))));
        assertTrue(rejected(body).isEmpty(), body);
        return l;
    }

    int pending(MockHttpSession s) throws Exception {
        return JsonPath.<List<?>>read(mvc.perform(get("/api/invitations").session(s)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString(), "$").size();
    }

    @Test
    void invitationGrantsNothingUntilAcceptedThenSyncsTheWholeList() throws Exception {
        String o = "so" + uniq(), b = "sb" + uniq();
        MockHttpSession owner = signUp(o), bob = signUp(b);
        UUID t = UUID.randomUUID();
        UUID l = listWithTask(owner, t);

        // Bob is up to date before he is invited, so his cursor is already past the list's seq.
        long bobCursor = cursor(sync(bob, 0, NOTHING));
        invite(owner, l, email(b), "EDITOR").andExpect(status().isCreated());
        assertEquals(1, pending(bob));
        String before = sync(bob, bobCursor, NOTHING);
        assertTrue(rows(before, "lists").isEmpty(), "a pending invitation shows nothing");
        assertTrue(((List<?>) JsonPath.read(before, "$.memberOf")).isEmpty());

        send(post("/api/invitations/" + l + "/accept"), bob, null).andExpect(status().isNoContent());
        assertEquals(0, pending(bob));
        String after = sync(bob, cursor(before), NOTHING);
        Map<String, Object> row = byId(rows(after, "lists"), l);
        assertEquals("EDITOR", row.get("role"));
        assertEquals(o, row.get("ownerName"));
        assertEquals("Milk", byId(rows(after, "tasks"), t).get("title"));
        assertTrue(((List<?>) JsonPath.read(after, "$.memberOf")).contains(l.toString()));

        // The owner's own role comes back as OWNER.
        assertEquals("OWNER", byId(rows(sync(owner, 0, NOTHING), "lists"), l).get("role"));

        // An editor may change tasks; the change reaches the owner.
        Map<String, Object> edited = task(t, l, "Oat milk", 100);
        String push = sync(bob, cursor(after), changes(List.of(), List.of(edited)));
        assertTrue(rejected(push).isEmpty(), push);
        assertEquals("Oat milk", byId(rows(sync(owner, cursor(after) - 1, NOTHING), "tasks"), t).get("title"));
    }

    @Test
    void viewerCannotEditAndRoleChangeReachesTheMember() throws Exception {
        String o = "so" + uniq(), b = "sb" + uniq();
        MockHttpSession owner = signUp(o), bob = signUp(b);
        UUID t = UUID.randomUUID();
        UUID l = listWithTask(owner, t);
        invite(owner, l, email(b), "VIEWER").andExpect(status().isCreated());
        send(post("/api/invitations/" + l + "/accept"), bob, null).andExpect(status().isNoContent());
        String pulled = sync(bob, 0, NOTHING);
        assertEquals("VIEWER", byId(rows(pulled, "lists"), l).get("role"));

        String push = sync(bob, cursor(pulled), changes(List.of(), List.of(task(t, l, "Hacked", 200))));
        assertEquals("forbidden", rejected(push).get(0).get("reason"));
        assertEquals("Milk", byId(rows(push, "tasks"), t).get("title"), "server copy is echoed back");

        send(patch("/api/lists/" + l + "/members/" + jdbcUser(b)), owner, Map.of("role", "EDITOR")).andExpect(status().isNoContent());
        String after = sync(bob, cursor(push), NOTHING);
        assertEquals("EDITOR", byId(rows(after, "lists"), l).get("role"));
    }

    @Test
    void removingAMemberStopsAccessAndSyncReportsIt() throws Exception {
        String o = "so" + uniq(), b = "sb" + uniq();
        MockHttpSession owner = signUp(o), bob = signUp(b);
        UUID t = UUID.randomUUID();
        UUID l = listWithTask(owner, t);
        invite(owner, l, email(b), "EDITOR").andExpect(status().isCreated());
        send(post("/api/invitations/" + l + "/accept"), bob, null).andExpect(status().isNoContent());
        String pulled = sync(bob, 0, NOTHING);
        assertTrue(((List<?>) JsonPath.read(pulled, "$.memberOf")).contains(l.toString()));

        send(delete("/api/lists/" + l + "/members/" + jdbcUser(b)), owner, null).andExpect(status().isNoContent());
        String after = sync(bob, cursor(pulled), changes(List.of(), List.of(task(t, l, "Sneaky", 300))));
        assertFalse(((List<?>) JsonPath.read(after, "$.memberOf")).contains(l.toString()));
        assertEquals("forbidden", rejected(after).get(0).get("reason"));
        send(get("/api/lists/" + l + "/members"), bob, null).andExpect(status().isNotFound());
    }

    @Test
    void aMemberCanLeaveButNotRemoveOthers() throws Exception {
        String o = "so" + uniq(), b = "sb" + uniq(), c = "sc" + uniq();
        MockHttpSession owner = signUp(o), bob = signUp(b), cat = signUp(c);
        UUID l = listWithTask(owner, UUID.randomUUID());
        for (String n : List.of(b, c)) invite(owner, l, email(n), "EDITOR").andExpect(status().isCreated());
        for (MockHttpSession s : List.of(bob, cat)) send(post("/api/invitations/" + l + "/accept"), s, null).andExpect(status().isNoContent());

        send(delete("/api/lists/" + l + "/members/" + jdbcUser(c)), bob, null).andExpect(status().isForbidden());
        send(delete("/api/lists/" + l + "/members/" + jdbcUser(b)), bob, null).andExpect(status().isNoContent());
        assertFalse(((List<?>) JsonPath.read(sync(bob, 0, NOTHING), "$.memberOf")).contains(l.toString()));
    }

    @Test
    void onlyTheOwnerManagesMembersAndStrangersCannotProbe() throws Exception {
        String o = "so" + uniq(), b = "sb" + uniq(), s = "ss" + uniq();
        MockHttpSession owner = signUp(o), bob = signUp(b), stranger = signUp(s);
        UUID l = listWithTask(owner, UUID.randomUUID());
        invite(owner, l, email(b), "EDITOR").andExpect(status().isCreated());
        send(post("/api/invitations/" + l + "/accept"), bob, null).andExpect(status().isNoContent());

        invite(bob, l, email(s), "VIEWER").andExpect(status().isForbidden());
        invite(stranger, l, email(s), "VIEWER").andExpect(status().isNotFound());
        invite(owner, l, email(o), "VIEWER").andExpect(status().isBadRequest());
        invite(owner, l, email(s), "OWNER").andExpect(status().isBadRequest());
        invite(owner, l, "nobody-" + uniq(), "VIEWER").andExpect(status().isNotFound());
        invite(owner, l, "not an email@", "VIEWER").andExpect(status().isBadRequest());
        send(get("/api/lists/" + l + "/members"), stranger, null).andExpect(status().isNotFound());
        send(post("/api/invitations/" + l + "/accept"), stranger, null).andExpect(status().isNotFound());
    }

    @Test
    void ownerSeesPendingMembersOthersDoNot() throws Exception {
        String o = "so" + uniq(), b = "sb" + uniq(), c = "sc" + uniq();
        MockHttpSession owner = signUp(o), bob = signUp(b);
        signUp(c);
        UUID l = listWithTask(owner, UUID.randomUUID());
        invite(owner, l, email(b), "EDITOR").andExpect(status().isCreated());
        invite(owner, l, email(c), "VIEWER").andExpect(status().isCreated());
        send(post("/api/invitations/" + l + "/accept"), bob, null).andExpect(status().isNoContent());

        String mine = send(get("/api/lists/" + l + "/members"), owner, null).andReturn().getResponse().getContentAsString();
        assertEquals(2, ((List<?>) JsonPath.read(mine, "$.members")).size());
        String theirs = send(get("/api/lists/" + l + "/members"), bob, null).andReturn().getResponse().getContentAsString();
        assertEquals(1, ((List<?>) JsonPath.read(theirs, "$.members")).size());
        assertEquals(o, JsonPath.read(theirs, "$.owner.name"));
    }

    @Test
    void decliningRemovesTheInvitation() throws Exception {
        String o = "so" + uniq(), b = "sb" + uniq();
        MockHttpSession owner = signUp(o), bob = signUp(b);
        UUID l = listWithTask(owner, UUID.randomUUID());
        invite(owner, l, email(b), "VIEWER").andExpect(status().isCreated());
        send(post("/api/invitations/" + l + "/decline"), bob, null).andExpect(status().isNoContent());
        assertEquals(0, pending(bob));
        send(post("/api/invitations/" + l + "/accept"), bob, null).andExpect(status().isNotFound());
    }

    @Test
    void invitingSomeoneNotSignedUpYetLeavesAnInvitationWaiting() throws Exception {
        String o = "so" + uniq(), late = "sl" + uniq();
        MockHttpSession owner = signUp(o);
        UUID l = listWithTask(owner, UUID.randomUUID());
        invite(owner, l, email(late).toUpperCase(), "EDITOR").andExpect(status().isCreated());
        MockHttpSession later = signUp(late); // first Google sign-in claims the placeholder
        assertEquals(1, pending(later));
    }

    @Test
    void passwordAccountsAreInvitedByUsername() throws Exception {
        String o = "so" + uniq(), u = "pw_" + uniq();
        MockHttpSession owner = signUp(o);
        UUID l = listWithTask(owner, UUID.randomUUID());
        MockHttpSession pw = (MockHttpSession) send(post("/api/auth/register"), new MockHttpSession(), Map.of("username", u, "password", "correct horse"))
            .andExpect(status().isCreated()).andReturn().getRequest().getSession(false);
        invite(owner, l, u.toUpperCase(), "VIEWER").andExpect(status().isCreated());
        assertEquals(1, pending(pw));
        send(post("/api/invitations/" + l + "/accept"), pw, null).andExpect(status().isNoContent());
        assertEquals(l.toString(), ((List<?>) JsonPath.read(sync(pw, 0, NOTHING), "$.memberOf")).get(0));
    }
}
