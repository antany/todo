package ca.antany.app.todo.share;

import ca.antany.app.todo.share.ShareDtos.InvitationDto;
import ca.antany.app.todo.share.ShareDtos.InviteRequest;
import ca.antany.app.todo.share.ShareDtos.MemberDto;
import ca.antany.app.todo.share.ShareDtos.MembersResponse;
import ca.antany.app.todo.share.ShareDtos.RoleRequest;
import ca.antany.app.todo.user.CurrentUser;
import java.security.Principal;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
class ShareController {
    private final ShareService share;
    private final CurrentUser currentUser;

    ShareController(ShareService share, CurrentUser currentUser) {
        this.share = share;
        this.currentUser = currentUser;
    }

    @GetMapping("/api/lists/{listId}/members")
    MembersResponse members(Principal p, @PathVariable UUID listId) {
        return share.members(currentUser.get(p).id(), listId);
    }

    @PostMapping("/api/lists/{listId}/members")
    @ResponseStatus(HttpStatus.CREATED)
    MemberDto invite(Principal p, @PathVariable UUID listId, @RequestBody InviteRequest req) {
        return share.invite(currentUser.get(p).id(), listId, req.identity(), req.role());
    }

    @PatchMapping("/api/lists/{listId}/members/{userId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void changeRole(Principal p, @PathVariable UUID listId, @PathVariable UUID userId, @RequestBody RoleRequest req) {
        share.changeRole(currentUser.get(p).id(), listId, userId, req.role());
    }

    @DeleteMapping("/api/lists/{listId}/members/{userId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void remove(Principal p, @PathVariable UUID listId, @PathVariable UUID userId) {
        share.remove(currentUser.get(p).id(), listId, userId);
    }

    @GetMapping("/api/invitations")
    List<InvitationDto> invitations(Principal p) {
        return share.invitations(currentUser.get(p).id());
    }

    @PostMapping("/api/invitations/{listId}/accept")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void accept(Principal p, @PathVariable UUID listId) {
        share.accept(currentUser.get(p).id(), listId);
    }

    @PostMapping("/api/invitations/{listId}/decline")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void decline(Principal p, @PathVariable UUID listId) {
        share.decline(currentUser.get(p).id(), listId);
    }
}
