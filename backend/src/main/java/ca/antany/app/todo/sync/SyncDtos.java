package ca.antany.app.todo.sync;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Wire format of POST /api/sync. Field names match the client's local store rows. */
public final class SyncDtos {
    private SyncDtos() {}

    public record ListDto(UUID id, UUID ownerId, String name, String color, Double position, Boolean archived,
                          Boolean deleted, Instant updatedAt,
                          String role, String ownerName) {}

    public record TaskDto(UUID id, UUID listId, String title, String notes, Integer priority, Instant dueAt,
                          Instant followUpAt, Instant remindAt, String repeatRule, String status, Instant completedAt,
                          Double position, List<String> tags, Boolean deleted, Instant updatedAt) {}

    public record SubtaskDto(UUID id, UUID taskId, String title, Boolean done, Double position, Boolean deleted,
                             Instant updatedAt) {}

    public record ActivityDto(UUID id, UUID taskId, UUID actorId, String kind, Map<String, Object> detail, Instant at) {}

    public record Changes(List<ListDto> lists, List<TaskDto> tasks, List<SubtaskDto> subtasks, List<ActivityDto> activity) {
        public Changes {
            lists = lists == null ? List.of() : lists;
            tasks = tasks == null ? List.of() : tasks;
            subtasks = subtasks == null ? List.of() : subtasks;
            activity = activity == null ? List.of() : activity;
        }
    }

    public record SyncRequest(Long cursor, Changes changes) {}

    /** A pushed row the server did not apply. type is list|task|subtask|activity; reason forbidden|invalid|missing_parent. */
    public record Rejected(String type, UUID id, String reason) {}

    /** memberOf: every list shared with the user right now, so a client can drop lists it lost access to. */
    public record SyncResponse(long cursor, Changes changes, List<Rejected> rejected, List<UUID> memberOf) {}
}
