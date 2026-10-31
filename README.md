# Todo

A mobile-friendly, installable (PWA) todo app: several lists per person, due dates, follow-ups with an activity log, reminders, repeating tasks, drag-to-reorder, and lists you can share with view/edit roles. Works offline with no account; sign in (Google, or just a username and password) to sync across devices.

**Stack:** React (plain JSX) + Material UI (Vite), Spring Boot 4 on Java 25, JDBC only (no JPA), PostgreSQL, Gradle.

## Quick start

Needs JDK 25 and [podman](https://podman.io/) (Node is not needed on the host; npm runs in a container through Gradle).

```bash
podman kube play podman/postgres.yaml     # dev Postgres on :5433
./gradlew :backend:bootRun                # builds the frontend, serves everything on :8080
```

Open <http://localhost:8080/todo/>. Username/password accounts work immediately; Google sign-in needs `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.

## Deploy

```bash
./gradlew :backend:bootJar
podman build -f podman/Containerfile -t localhost/todo-app:latest .
cp podman/secrets.example.yaml podman/secrets.yaml   # fill in, chmod 600
podman kube play podman/secrets.yaml podman/todo-pod.yaml
```

Raspberry Pi / multi-arch (x86-64 + arm64): `scripts/build-multiarch.sh`, walkthrough in **[docs/deploy-raspberry-pi.html](docs/deploy-raspberry-pi.html)**.

Nightly backup: `scripts/backup-db.sh` (cron it). Full walkthrough (Cloudflare Tunnel, Google setup, configuration, updating, troubleshooting) is in **[docs/usage-and-deployment.html](docs/usage-and-deployment.html)**; open it in a browser.

Developer notes (architecture, sync design, conventions) are in [CLAUDE.md](CLAUDE.md).
