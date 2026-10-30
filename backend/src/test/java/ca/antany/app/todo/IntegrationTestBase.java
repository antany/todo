package ca.antany.app.todo;

import ca.antany.app.todo.user.UserProvisioning;
import java.util.List;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.oauth2.core.oidc.OidcIdToken;
import org.springframework.security.oauth2.core.oidc.user.DefaultOidcUser;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.postgresql.PostgreSQLContainer;

/** One Postgres container shared by all integration tests (Spring caches the context across classes). */
@SpringBootTest
@AutoConfigureMockMvc
abstract class IntegrationTestBase {
    @ServiceConnection
    static final PostgreSQLContainer DB = new PostgreSQLContainer("postgres:17");

    static {
        DB.start();
        Runtime.getRuntime().addShutdownHook(new Thread(DB::stop));
    }

    @Autowired protected MockMvc mvc;
    @Autowired protected UserProvisioning provisioning;

    /** The email address {@link #signUp(String)} uses for a short test name. */
    protected static String email(String name) {
        return name + "@test.local";
    }

    /** Signs a person in the way a Google sign-in would: provision the account, then hold an OIDC session. */
    protected MockHttpSession signUp(String name) throws Exception {
        return signIn(email(name), "sub-" + name, name);
    }

    protected MockHttpSession signIn(String email, String googleSub, String displayName) {
        provisioning.provision(googleSub, email, true, displayName);
        return sessionFor(googleSub, email);
    }

    /** A logged-in HTTP session for an OIDC user with this subject id (no provisioning). */
    protected MockHttpSession sessionFor(String googleSub, String email) {
        OidcIdToken token = OidcIdToken.withTokenValue("test-token").subject(googleSub)
                .claim("email", email).claim("email_verified", true).build();
        DefaultOidcUser principal = new DefaultOidcUser(List.of(new SimpleGrantedAuthority("ROLE_USER")), token);
        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(new OAuth2AuthenticationToken(principal, principal.getAuthorities(), "google"));
        MockHttpSession session = new MockHttpSession();
        session.setAttribute(HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY, context);
        return session;
    }

}
