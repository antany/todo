package ca.antany.app.todo.web;

import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Serves the PWA manifest with its proper media type: neither the servlet container nor Spring's static
 * resource handler knows the .webmanifest extension.
 */
@RestController
class ManifestController {
    private static final Resource MANIFEST = new ClassPathResource("static/manifest.webmanifest");

    @GetMapping(value = "/manifest.webmanifest", produces = "application/manifest+json")
    ResponseEntity<Resource> manifest() {
        return MANIFEST.exists() ? ResponseEntity.ok(MANIFEST) : ResponseEntity.notFound().build();
    }
}
