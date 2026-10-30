package ca.antany.app.todo.sync;

import ca.antany.app.todo.sync.SyncDtos.SyncRequest;
import ca.antany.app.todo.sync.SyncDtos.SyncResponse;
import ca.antany.app.todo.user.CurrentUser;
import java.security.Principal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/sync")
class SyncController {
    private final SyncService sync;
    private final CurrentUser currentUser;

    SyncController(SyncService sync, CurrentUser currentUser) {
        this.sync = sync;
        this.currentUser = currentUser;
    }

    @PostMapping
    SyncResponse sync(Principal principal, @RequestBody SyncRequest request) {
        return sync.sync(currentUser.get(principal).id(), request);
    }
}
