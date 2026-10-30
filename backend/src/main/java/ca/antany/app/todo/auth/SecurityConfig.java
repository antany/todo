package ca.antany.app.todo.auth;

import ca.antany.app.todo.user.SignInNotAllowedException;
import ca.antany.app.todo.user.UserProvisioning;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.client.oidc.userinfo.OidcUserRequest;
import org.springframework.security.oauth2.client.oidc.userinfo.OidcUserService;
import org.springframework.security.oauth2.client.userinfo.OAuth2UserService;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.security.web.authentication.logout.HttpStatusReturningLogoutSuccessHandler;
import org.springframework.security.web.authentication.www.BasicAuthenticationFilter;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;
import org.springframework.security.web.servlet.util.matcher.PathPatternRequestMatcher;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Google sign-in (OIDC). The SPA's /login page has a "Continue with Google" link to
 * /oauth2/authorization/google; Google redirects back to /login/oauth2/code/google, after which the session
 * cookie identifies the user. The API itself answers 401 (no redirects) so the SPA can handle it.
 */
@Configuration
class SecurityConfig {

    @Bean
    OAuth2UserService<OidcUserRequest, OidcUser> oidcUserService(UserProvisioning provisioning) {
        OidcUserService delegate = new OidcUserService();
        return request -> {
            OidcUser oidc = delegate.loadUser(request);
            try {
                provisioning.provision(oidc.getSubject(), oidc.getEmail(),
                        Boolean.TRUE.equals(oidc.getEmailVerified()), oidc.getFullName());
            } catch (SignInNotAllowedException e) {
                throw new OAuth2AuthenticationException(new OAuth2Error(e.getCode(), e.getMessage(), null), e);
            }
            return oidc;
        };
    }

    @Bean
    PasswordEncoder passwordEncoder() {
        return PasswordEncoderFactories.createDelegatingPasswordEncoder(); // bcrypt, hash prefixed with {bcrypt}
    }

    @Bean
    SecurityFilterChain filterChain(HttpSecurity http, OAuth2UserService<OidcUserRequest, OidcUser> oidcUserService)
            throws Exception {
        http
            .authorizeHttpRequests(a -> a
                .requestMatchers("/api/auth/login", "/api/auth/register", "/api/auth/options").permitAll()
                .requestMatchers("/api/**").authenticated()
                .anyRequest().permitAll())
            // SPA reads the XSRF-TOKEN cookie and echoes it in the X-XSRF-TOKEN header.
            .csrf(c -> c
                .csrfTokenRepository(CookieCsrfTokenRepository.withHttpOnlyFalse())
                .csrfTokenRequestHandler(new CsrfTokenRequestAttributeHandler()))
            .addFilterAfter(new CsrfCookieFilter(), BasicAuthenticationFilter.class)
            .oauth2Login(o -> o
                .loginPage("/login")
                .userInfoEndpoint(u -> u.oidcUserService(oidcUserService))
                .defaultSuccessUrl("/all", true)
                .failureHandler((req, res, ex) -> {
                    String code = ex instanceof OAuth2AuthenticationException oe ? oe.getError().getErrorCode() : "failed";
                    res.sendRedirect(req.getContextPath() + "/login?error=" + URLEncoder.encode(code, StandardCharsets.UTF_8));
                }))
            .logout(l -> l
                .logoutUrl("/api/auth/logout")
                .logoutSuccessHandler(new HttpStatusReturningLogoutSuccessHandler()))
            .exceptionHandling(e -> e.defaultAuthenticationEntryPointFor(
                new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED), PathPatternRequestMatcher.withDefaults().matcher("/api/**")));
        return http.build();
    }

    /** Spring defers CSRF token creation; touching it makes the cookie get sent on every response. */
    static class CsrfCookieFilter extends OncePerRequestFilter {
        @Override
        protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
                throws ServletException, IOException {
            CsrfToken token = (CsrfToken) req.getAttribute(CsrfToken.class.getName());
            if (token != null) {
                token.getToken();
            }
            chain.doFilter(req, res);
        }
    }
}
