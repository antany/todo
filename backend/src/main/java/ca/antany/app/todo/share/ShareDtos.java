package ca.antany.app.todo.share;

import java.util.List;
import java.util.UUID;

public final class ShareDtos {
    private ShareDtos() {}

    /** identity is an email (Google people) or a username (password accounts). */
    public record InviteRequest(String identity, String role) {}

    public record RoleRequest(String role) {}

    public record MemberDto(UUID userId, String name, String identity, String role, String status) {}

    /** The owner is listed separately; non-owners only see accepted members. */
    public record MembersResponse(MemberDto owner, List<MemberDto> members) {}

    public record InvitationDto(UUID listId, String listName, String color, String invitedBy, String role) {}
}
