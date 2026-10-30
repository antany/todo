package ca.antany.app.todo;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import ca.antany.app.todo.user.UserRepository;
import com.jayway.jsonpath.JsonPath;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.mock.web.MockHttpSession;
import tools.jackson.databind.json.JsonMapper;

class SyncTest extends IntegrationTestBase {
    @Autowired JsonMapper json;
    @Autowired JdbcClient jdbc;
    @Autowired UserRepository users;

    private static final Instant BASE = Instant.now().minusSeconds(3600).truncatedTo(java.time.temporal.ChronoUnit.MILLIS);

    static String at(long seconds) { return BASE.plusSeconds(seconds).toString(); }
    static String uniq() { return UUID.randomUUID().toString().substring(0, 8); }

    static Map<String, Object> list(UUID id, String name, long t) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", id); m.put("name", name); m.put("color", "#3949ab"); m.put("position", 1.0);
        m.put("archived", false); m.put("deleted", false); m.put("updatedAt", at(t));
        return m;
    }

    static Map<String, Object> task(UUID id, UUID listId, String title, long t) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", id); m.put("listId", listId); m.put("title", title); m.put("notes", ""); m.put("priority", 0);
        m.put("dueAt", null); m.put("followUpAt", null); m.put("remindAt", null); m.put("repeatRule", "NONE");
        m.put("status", "TODO"); m.put("completedAt", null); m.put("position", 1.0); m.put("tags", List.of());
        m.put("deleted", false); m.put("updatedAt", at(t));
        return m;
    }

    static Map<String, Object> subtask(UUID id, UUID taskId, String title, long t) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", id); m.put("taskId", taskId); m.put("title", title); m.put("done", false); m.put("position", 1.0);
        m.put("deleted", false); m.put("updatedAt", at(t));
        return m;
    }

    static Map<String, Object> changes(List<?> lists, List<?> tasks, List<?> subtasks, List<?> activity) {
        return Map.of("lists", lists, "tasks", tasks, "subtasks", subtasks, "activity", activity);
    }

    static Map<String, Object> changes(List<?> lists, List<?> tasks) { return changes(lists, tasks, List.of(), List.of()); }
    static final Map<String, Object> NOTHING = changes(List.of(), List.of());

    String sync(MockHttpSession s, long cursor, Map<String, Object> changes) throws Exception {
        return mvc.perform(post("/api/sync").session(s).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("cursor", cursor, "changes", changes))))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
    }

    static long cursor(String body) { return ((Number) JsonPath.read(body, "$.cursor")).longValue(); }
    static List<Map<String, Object>> rows(String body, String table) { return JsonPath.read(body, "$.changes." + table); }
    static List<Map<String, Object>> rejected(String body) { return JsonPath.read(body, "$.rejected"); }

    static Map<String, Object> byId(List<Map<String, Object>> rows, UUID id) {
        return rows.stream().filter(r -> r.get("id").equals(id.toString())).findFirst().orElse(null);
    }

    void member(MockHttpSession owner, String ownerName, String memberName, UUID listId, String role, String status) {
        UUID o = users.findByGoogleSub("sub-" + ownerName).orElseThrow().id();
        UUID m = users.findByGoogleSub("sub-" + memberName).orElseThrow().id();
        jdbc.sql("insert into list_member (list_id, user_id, role, status, invited_by) values (:l, :u, :r, :s, :o)")
            .param("l", listId).param("u", m).param("r", role).param("s", status).param("o", o).update();
    }

    @Test
    void pushedRowsReachAnotherDeviceOfTheSameAccount() throws Exception {
        String name = "sa" + uniq();
        MockHttpSession phone = signUp(name);
        UUID l = UUID.randomUUID(), t = UUID.randomUUID(), st = UUID.randomUUID(), a = UUID.randomUUID();
        Map<String, Object> t1 = task(t, l, "Milk", 10);
        t1.put("tags", List.of("dairy", "urgent"));
        t1.put("dueAt", at(7200));
        Map<String, Object> act = new LinkedHashMap<>(Map.of("id", a, "taskId", t, "kind", "created", "at", at(10)));
        act.put("detail", Map.of("x", 1));
        String pushed = sync(phone, 0, changes(List.of(list(l, "Groceries", 5)), List.of(t1), List.of(subtask(st, t, "2%", 11)), List.of(act)));
        assertTrue(rejected(pushed).isEmpty(), pushed);

        MockHttpSession laptop = signUp(name); // same Google account, second device
        String pulled = sync(laptop, 0, NOTHING);
        assertEquals("Groceries", byId(rows(pulled, "lists"), l).get("name"));
        Map<String, Object> pt = byId(rows(pulled, "tasks"), t);
        assertEquals("Milk", pt.get("title"));
        assertEquals(List.of("dairy", "urgent"), pt.get("tags"));
        assertEquals(Instant.parse(at(7200)), Instant.parse((String) pt.get("dueAt")));
        assertEquals("2%", byId(rows(pulled, "subtasks"), st).get("title"));
        Map<String, Object> pa = byId(rows(pulled, "activity"), a);
        assertEquals("created", pa.get("kind"));
        assertEquals(1, ((Map<?, ?>) pa.get("detail")).get("x"));
        assertTrue(pa.get("actorId") != null, "server stamps the actor");

        // nothing new since the returned cursor
        String again = sync(laptop, cursor(pulled), NOTHING);
        assertTrue(rows(again, "tasks").isEmpty() && rows(again, "lists").isEmpty());
    }

    @Test
    void newerWriteWinsAndOlderIsIgnoredButAnswered() throws Exception {
        MockHttpSession s = signUp("sb" + uniq());
        UUID l = UUID.randomUUID(), t = UUID.randomUUID();
        long c = cursor(sync(s, 0, changes(List.of(list(l, "L", 1)), List.of(task(t, l, "v2", 20)))));

        String stale = sync(s, c, changes(List.of(), List.of(task(t, l, "old", 10))));   // older edit from an offline device
        assertEquals("v2", byId(rows(stale, "tasks"), t).get("title"), "server's newer row is sent back");
        String tie = sync(s, c, changes(List.of(), List.of(task(t, l, "tie", 20))));
        assertEquals("v2", byId(rows(tie, "tasks"), t).get("title"), "a tie keeps the server's row");
        String newer = sync(s, c, changes(List.of(), List.of(task(t, l, "v3", 30))));
        assertEquals("v3", byId(rows(newer, "tasks"), t).get("title"));
    }

    @Test
    void tombstonesPropagateAndOnlyWhenNewer() throws Exception {
        MockHttpSession s = signUp("sc" + uniq());
        UUID l = UUID.randomUUID(), t = UUID.randomUUID();
        long c = cursor(sync(s, 0, changes(List.of(list(l, "L", 1)), List.of(task(t, l, "gone", 10)))));
        Map<String, Object> dead = task(t, l, "gone", 20);
        dead.put("deleted", true);
        String del = sync(s, c, changes(List.of(), List.of(dead)));
        c = cursor(del);
        assertEquals(true, byId(rows(sync(signUp("sc-x" + uniq()), 0, NOTHING), "tasks"), t) == null ? true : false); // stranger sees nothing
        Map<String, Object> revive = task(t, l, "gone", 15); // older than the delete: must not resurrect
        String r = sync(s, c, changes(List.of(), List.of(revive)));
        assertEquals(true, byId(rows(r, "tasks"), t).get("deleted"));
    }

    @Test
    void strangersCannotReadOrWriteSomeoneElsesList() throws Exception {
        String an = "sd" + uniq(), bn = "se" + uniq();
        MockHttpSession a = signUp(an), b = signUp(bn);
        UUID l = UUID.randomUUID(), t = UUID.randomUUID(), intruder = UUID.randomUUID();
        sync(a, 0, changes(List.of(list(l, "Private", 1)), List.of(task(t, l, "secret", 2))));

        String body = sync(b, 0, changes(List.of(list(l, "Hijack", 99)), List.of(task(intruder, l, "spam", 99), task(t, l, "edited", 99))));
        assertEquals(3, rejected(body).size(), body);
        assertTrue(rejected(body).stream().allMatch(r -> r.get("reason").equals("forbidden")));
        assertTrue(rows(body, "lists").isEmpty() && rows(body, "tasks").isEmpty(), "nothing leaks back: " + body);
        String owner = sync(a, 0, NOTHING);
        assertEquals("Private", byId(rows(owner, "lists"), l).get("name"));
        assertEquals("secret", byId(rows(owner, "tasks"), t).get("title"));
        assertEquals(null, byId(rows(owner, "tasks"), intruder));
    }

    @Test
    void viewersReadButCannotWrite_editorsEditTasksButNotTheList() throws Exception {
        String on = "sf" + uniq(), vn = "sg" + uniq(), en = "sh" + uniq(), pn = "si" + uniq();
        MockHttpSession owner = signUp(on), viewer = signUp(vn), editor = signUp(en), pending = signUp(pn);
        UUID l = UUID.randomUUID(), t = UUID.randomUUID();
        sync(owner, 0, changes(List.of(list(l, "Shared", 1)), List.of(task(t, l, "Plan", 2))));
        member(owner, on, vn, l, "VIEWER", "ACCEPTED");
        member(owner, on, en, l, "EDITOR", "ACCEPTED");
        member(owner, on, pn, l, "EDITOR", "PENDING");

        assertTrue(rows(sync(pending, 0, NOTHING), "lists").isEmpty(), "a pending invitation grants nothing");
        assertEquals("Plan", byId(rows(sync(viewer, 0, NOTHING), "tasks"), t).get("title"));

        UUID extra = UUID.randomUUID();
        String v = sync(viewer, 0, changes(List.of(), List.of(task(t, l, "viewer edit", 50), task(extra, l, "new", 50))));
        assertEquals(2, rejected(v).size());
        assertEquals("Plan", byId(rows(v, "tasks"), t).get("title"), "viewer is given the real row back");

        String e = sync(editor, 0, changes(List.of(list(l, "Renamed", 60)), List.of(task(t, l, "editor edit", 60), task(extra, l, "added", 60))));
        assertEquals(1, rejected(e).size());
        assertEquals("list", rejected(e).get(0).get("type"));
        assertEquals("Shared", byId(rows(e, "lists"), l).get("name"));
        assertEquals("editor edit", byId(rows(e, "tasks"), t).get("title"));
        assertEquals("added", byId(rows(sync(owner, 0, NOTHING), "tasks"), extra).get("title"));
    }

    @Test
    void invalidRowsAreRejectedNotCrashed() throws Exception {
        MockHttpSession s = signUp("sj" + uniq());
        UUID l = UUID.randomUUID(), t = UUID.randomUUID(), orphan = UUID.randomUUID();
        Map<String, Object> badPriority = task(t, l, "x", 5);
        badPriority.put("priority", 9);
        Map<String, Object> noList = task(orphan, UUID.randomUUID(), "orphan", 5);
        String body = sync(s, 0, changes(List.of(list(l, "L", 1)), List.of(badPriority, noList)));
        List<Map<String, Object>> rej = rejected(body);
        assertEquals("invalid", byId(rej, t).get("reason"));
        assertEquals("missing_parent", byId(rej, orphan).get("reason"));
        assertTrue(byId(rows(body, "lists"), l) != null, "valid rows in the same request still apply");
    }

    @Test
    void clientClocksFarInTheFutureAreClamped() throws Exception {
        MockHttpSession s = signUp("sk" + uniq());
        UUID l = UUID.randomUUID(), t = UUID.randomUUID();
        Map<String, Object> future = task(t, l, "future", 0);
        future.put("updatedAt", Instant.now().plusSeconds(365L * 86400).toString());
        String body = sync(s, 0, changes(List.of(list(l, "L", 1)), List.of(future)));
        Instant stored = Instant.parse((String) byId(rows(body, "tasks"), t).get("updatedAt"));
        assertTrue(stored.isBefore(Instant.now().plusSeconds(6 * 60)), stored.toString());
        // so a normal edit made now is still able to win over it eventually
        assertTrue(stored.isAfter(Instant.now().plusSeconds(4 * 60)), stored.toString());
    }

    @Test
    void syncNeedsASessionAndACsrfToken() throws Exception {
        mvc.perform(post("/api/sync").with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/sync").session(signUp("sl" + uniq())).contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().isForbidden());
    }

    @Test
    void emptyRequestIsAPlainPull() throws Exception {
        MockHttpSession s = signUp("sm" + uniq());
        mvc.perform(post("/api/sync").session(s).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().isOk());
    }
}
