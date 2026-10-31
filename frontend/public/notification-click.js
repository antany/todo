// Imported by the generated service worker: tapping a reminder notification focuses the app (or opens it).
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = self.registration.scope + 'all';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => w.url.startsWith(self.registration.scope));
      return open ? open.focus() : self.clients.openWindow(target);
    }),
  );
});
