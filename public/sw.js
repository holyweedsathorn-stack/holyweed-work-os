// Service worker for Holyweed Work OS.
//
// This app previously had no service worker at all — installability rode
// on the manifest alone. Push notifications need one regardless (it's what
// receives the `push` event while the app is closed), so this also makes
// "Add to Home Screen" more reliable going forward, as a side effect.
//
// Deliberately minimal: no offline caching yet. Adding a fetch handler /
// cache strategy later is a separate decision, not bundled in here.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = { title: "Holyweed", body: "", link: "/" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    // Non-JSON payload — fall back to the defaults above.
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { link: data.link || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = event.notification.data?.link || "/";

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of allClients) {
        // Reuse an already-open tab rather than stacking a new one.
        if ("focus" in client) {
          client.navigate(link);
          return client.focus();
        }
      }
      return self.clients.openWindow(link);
    })()
  );
});
