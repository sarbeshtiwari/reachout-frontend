// Reachout service worker: shows push notifications when no Reachout tab is open, and opens the app on click.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));

self.addEventListener("push", event => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { title: "Reachout", body: event.data?.text() || "" }; }
  event.waitUntil(self.registration.showNotification(d.title || "Reachout", {
    body: d.body || "", tag: d.tag || "reachout", renotify: true,
    icon: "/assets/icon-192.png", badge: "/assets/icon-192.png", data: { link: d.link || "" },
  }));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const link = event.notification.data?.link || "";
  const url = "/app" + (link.startsWith("#") ? "/" + link.slice(1) : link);
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const app = wins.find(w => new URL(w.url).pathname.startsWith("/app"));
    if (app) { await app.focus(); return app.navigate(url).catch(() => {}); }
    return self.clients.openWindow(url);
  })());
});
