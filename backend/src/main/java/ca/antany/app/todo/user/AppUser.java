package ca.antany.app.todo.user;

import java.util.UUID;

/**
 * One person. Signs in with Google (googleSub), with a username and password (username; the hash is not part of
 * this record), or both are absent for a placeholder: someone invited by email who has not signed in yet.
 * A password account has no email.
 */
public record AppUser(UUID id, String googleSub, String email, String username, String displayName) {}
