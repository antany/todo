package ca.antany.app.todo;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.forwardedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;

class SpaForwardingTest extends IntegrationTestBase {
    @Test
    void clientRoutesForwardToIndexHtml() throws Exception {
        for (String route : new String[] {"/login", "/lists", "/lists/abc", "/all", "/today", "/upcoming", "/follow-up", "/settings"}) {
            mvc.perform(get(route)).andExpect(status().isOk()).andExpect(forwardedUrl("/index.html"));
        }
    }

    @Test
    void unknownApiPathsAreNotSwallowed() throws Exception {
        mvc.perform(get("/api/nope")).andExpect(status().isUnauthorized());
    }

    @Test
    void manifestHasTheRightContentType() throws Exception {
        mvc.perform(get("/manifest.webmanifest"))
            .andExpect(status().isOk())
            .andExpect(content().contentTypeCompatibleWith("application/manifest+json"));
    }
}
