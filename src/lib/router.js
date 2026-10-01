import { useEffect, useState } from "react";

// Real paths in the address bar: /app/<page>/<param>?query  (e.g. /app/applications/abc123).
// Old #page links (notifications, bookmarks, e-mails) are converted on load.
export const BASE = "/app";

function upgradeLegacyHash() {
  if (location.hash.length > 1 && location.pathname.replace(/\/+$/, "") === BASE) {
    const [path, q] = location.hash.slice(1).split("?");
    history.replaceState(null, "", `${BASE}/${path}${q ? "?" + q : ""}`);
  }
}
upgradeLegacyHash();

function parse() {
  const rest = location.pathname.replace(/\/+$/, "").slice(BASE.length).replace(/^\//, "");
  const [page, ...param] = rest.split("/");
  return { page: page || "dashboard", param: param.length ? decodeURIComponent(param.join("/")) : "", query: new URLSearchParams(location.search), path: location.pathname + location.search };
}

// "applications/abc?x=1", "#applications/abc", "/app/applications/abc" → "/app/applications/abc?x=1"
export const toPath = to => {
  const t = String(to || "").replace(/^#/, "");
  return t.startsWith(BASE + "/") || t === BASE ? t : `${BASE}/${t.replace(/^\//, "")}`;
};

export function useRoute() {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const on = () => setRoute(parse());
    addEventListener("popstate", on);
    addEventListener("routechange", on);
    return () => { removeEventListener("popstate", on); removeEventListener("routechange", on); };
  }, []);
  return route;
}

export const go = to => {
  const p = toPath(to);
  if (p !== location.pathname + location.search) history.pushState(null, "", p);
  dispatchEvent(new Event("routechange"));
};
// Update the address without adding history (filters, closing a drawer).
export const replacePath = to => history.replaceState(null, "", toPath(to));

// In-app links are plain <a href="/app/…">; plain left-clicks are handled here without a page reload.
document.addEventListener("click", e => {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = e.target.closest?.("a[href]");
  if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
  const href = a.getAttribute("href");
  if (href.startsWith("#") && href.length > 1) { e.preventDefault(); go(href); return; }
  if (href === BASE || href.startsWith(BASE + "/")) {
    e.preventDefault(); go(href);
  }
});
