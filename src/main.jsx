import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import Auth from "./pages/Auth";
import { AppProvider } from "./lib/store";
import { applyTheme } from "./lib/theme";
import "./styles/base.css";
import "./styles/app.css";
import "./styles/pages.css";

// One bundle serves /app (the workspace) and /login, /signup (the sign-in screens).
const isAuth = /^\/(login|signup)\/?$/.test(location.pathname);

// Crashes in the browser are reported to our own API (which forwards them to Sentry when configured).
// Only the message, page path and stack are sent: never form contents or personal data.
const reported = new Set();
function report(message, stack) {
  const key = String(message).slice(0, 120);
  if (!message || reported.has(key) || reported.size >= 5) return;
  reported.add(key);
  fetch("/api/client-errors", { method: "POST", keepalive: true, headers: { "X-Requested-With": "fetch", "Content-Type": "application/json" },
    body: JSON.stringify({ message: key, where: location.pathname, stack: String(stack || "").slice(0, 2000) }) }).catch(() => {});
}
addEventListener("error", e => report(e.message, e.error?.stack));
addEventListener("unhandledrejection", e => { if (e.reason?.name !== "ApiError") report(e.reason?.message || e.reason, e.reason?.stack); });
const root = document.documentElement;

// Served by Flask, the page arrives with the saved look (theme, sidebar) and the sign-in redirects already
// applied. Served as static files (Netlify), the page asks the API for both before the first render.
async function prepare() {
  if (root.hasAttribute("data-theme-choice")) return;
  const get = url => fetch(url, { credentials: "same-origin" }).then(r => (r.ok ? r.json() : null)).catch(() => null);
  const [prefs, me] = await Promise.all([get("/api/prefs"), isAuth ? get("/api/me") : null]);
  if (isAuth && me) { location.replace("/app"); return new Promise(() => {}); }  // already signed in
  if (prefs) {
    root.dataset.themeChoice = prefs.theme;
    if (prefs.sidebar === "collapsed") root.dataset.sidebar = "collapsed";
    if (prefs.nav_closed?.length) root.dataset.navClosed = prefs.nav_closed.join(" ");
    applyTheme();
  }
}

prepare().finally(() => createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {isAuth ? <Auth signup={location.pathname.startsWith("/signup")} /> : <AppProvider><App /></AppProvider>}
  </React.StrictMode>,
));
