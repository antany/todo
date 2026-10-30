package ca.antany.app.todo.share;

import ca.antany.app.todo.list.ListAccess;
import ca.antany.app.todo.list.ListAccess.Role;
import ca.antany.app.todo.share.ShareDtos.InvitationDto;
import ca.antany.app.todo.share.ShareDtos.MemberDto;
import ca.antany.app.todo.share.ShareDtos.MembersResponse;
import ca.antany.app.todo.sync.SyncRepository;
import ca.antany.app.todo.user.AppUser;
import ca.antany.app.todo.user.UserRepository;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Sharing is an invitation: a new member is PENDING and sees nothing until they accept. Strangers get 404 so list
 * ids cannot be probed; members without the right get 403. Every change takes the sync lock, because accepting or
 * changing a role re-stamps synced rows.
 */
@Service
@Transactional
public class ShareService {
    private static final Set<String> ROLES = Set.of("EDITOR", "VIEWER");
    private static final int MAX_MEMBERS = 50;

    private final ShareRepository repo;
    private final SyncRepository sync;
    private final ListAccess access;
    private final UserRepository users;

    ShareService(ShareRepository repo, SyncRepository sync, ListAccess access, UserRepository users) {
        this.repo = repo;
        this.sync = sync;
        this.access = access;
        this.users = users;
    }

    @Transactional(readOnly = true)
    public MembersResponse members(UUID me, UUID listId) {
        Role role = role(me, listId);
        return new MembersResponse(repo.owner(listId), repo.members(listId, role == Role.OWNER));
    }

    public MemberDto invite(UUID me, UUID listId, String identity, String roleName) {
        requireOwner(me, listId);
        String role = role(roleName);
        AppUser target = resolve(identity);
        if (target.id().equals(me)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "You already own this list");
        sync.lock();
        String status = repo.statusOf(listId, target.id()).orElse(null);
        if (status == null && repo.memberCount(listId) >= MAX_MEMBERS) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A list can have at most " + MAX_MEMBERS + " members");
        }
        repo.upsert(listId, target.id(), role, me);
        if ("ACCEPTED".equals(status)) repo.bump(listId, false); // their role changed; devices must learn it
        return repo.members(listId, true).stream().filter(m -> m.userId().equals(target.id())).findFirst().orElseThrow();
    }

    public void changeRole(UUID me, UUID listId, UUID userId, String roleName) {
        requireOwner(me, listId);
        String role = role(roleName);
        sync.lock();
        if (repo.setRole(listId, userId, role) == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Not a member");
        repo.bump(listId, false);
    }

    /** The owner removes anyone; a member may remove only themselves (leave). Losing access is picked up by sync. */
    public void remove(UUID me, UUID listId, UUID userId) {
        Role role = role(me, listId);
        if (role != Role.OWNER && !me.equals(userId)) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only the owner can remove others");
        sync.lock();
        if (repo.remove(listId, userId) == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Not a member");
    }

    @Transactional(readOnly = true)
    public List<InvitationDto> invitations(UUID me) {
        return repo.pendingFor(me);
    }

    public void accept(UUID me, UUID listId) {
        sync.lock();
        if (repo.accept(listId, me) == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No such invitation");
        repo.bump(listId, true);
    }

    public void decline(UUID me, UUID listId) {
        sync.lock();
        if (repo.decline(listId, me) == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No such invitation");
    }

    // ---------- helpers ----------
    private Role role(UUID me, UUID listId) {
        Role r = access.roleOf(me, listId).orElse(Role.NONE);
        if (r == Role.NONE) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No such list");
        return r;
    }

    private void requireOwner(UUID me, UUID listId) {
        if (role(me, listId) != Role.OWNER) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only the owner can do that");
    }

    private static String role(String name) {
        String r = name == null ? "" : name.toUpperCase(Locale.ROOT);
        if (!ROLES.contains(r)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Role must be EDITOR or VIEWER");
        return r;
    }

    /** An address with an @ is a Google person (a placeholder is created if they have never signed in); anything else is a username. */
    private AppUser resolve(String identity) {
        String id = identity == null ? "" : identity.trim().toLowerCase(Locale.ROOT);
        if (id.isEmpty() || id.length() > 200) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Enter an email or a username");
        if (id.contains("@")) {
            if (!id.matches("[^@\\s]+@[^@\\s]+\\.[^@\\s]+")) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "That email address does not look right");
            return users.findByEmailIgnoreCase(id).orElseGet(() -> users.insert(null, id, id.substring(0, id.indexOf('@'))));
        }
        return users.findByUsername(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No account has that username"));
    }
}
