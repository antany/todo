package ca.antany.app.todo;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;

@TestPropertySource(properties = "app.password-signup=false")
class SignupDisabledTest extends IntegrationTestBase {
    @Test
    void registrationCanBeTurnedOff() throws Exception {
        mvc.perform(post("/api/auth/register").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"username\":\"newbie1\",\"password\":\"password-1\"}"))
            .andExpect(status().isForbidden());
        mvc.perform(get("/api/auth/options")).andExpect(jsonPath("$.passwordSignup").value(false));
    }
}
