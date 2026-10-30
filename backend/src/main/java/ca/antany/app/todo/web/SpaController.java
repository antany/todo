package ca.antany.app.todo.web;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

/**
 * Client-side routes of the React app. Forwarding them to index.html makes refresh, bookmarks and
 * the installed PWA's start URL work. Listed explicitly so unknown /api/** paths still 404.
 */
@Controller
class SpaController {
    @GetMapping({"/login", "/lists", "/lists/*", "/all", "/today", "/upcoming", "/follow-up", "/settings"})
    String index() {
        return "forward:/index.html";
    }
}
