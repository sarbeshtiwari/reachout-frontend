// After `vite build` for Netlify: turn the build into a complete static site.
// - index.html / login.html / signup.html with their titles and robots rules (Flask fills these in otherwise)
// - web manifest (icons and the service worker come from public/, copied by Vite)
// - _redirects for the app's own routes, and _headers with the security headers + a strict CSP
//   (inline scripts are allowed by their SHA-256 hash, so no 'unsafe-inline' for scripts).
// The API and public-site forwarding to the backend lives in netlify.toml (signed proxy rewrites).
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "netlify-dist");

const tpl = readFileSync(join(out, "index.html"), "utf8");
const page = (title, robots) => tpl.replaceAll("{{TITLE}}", title).replaceAll("{{ROBOTS}}", robots);
writeFileSync(join(out, "index.html"), page("Reachout", "noindex, nofollow"));
writeFileSync(join(out, "login.html"), page("Log in · Reachout", "noindex, follow"));
writeFileSync(join(out, "signup.html"), page("Create a free account · Reachout", "index, follow"));

writeFileSync(join(out, "site.webmanifest"), JSON.stringify({
  name: "Reachout", short_name: "Reachout", start_url: "/app", display: "standalone", background_color: "#ffffff", theme_color: "#4f46e5",
  icons: [{ src: "/assets/icon-192.png", sizes: "192x192", type: "image/png" }, { src: "/assets/icon-512.png", sizes: "512x512", type: "image/png" }],
}));

// Hash every inline <script> (executable ones only; JSON-LD isn't run, so CSP doesn't apply to it).
const hashes = [...tpl.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*type="application\/ld\+json")[^>]*>([\s\S]*?)<\/script>/g)]
  .map(m => `'sha256-${createHash("sha256").update(m[1]).digest("base64")}'`);

const csp = [
  "default-src 'self'",
  `script-src 'self' ${hashes.join(" ")} https://cdn.jsdelivr.net`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net",
  "font-src 'self' data: https://fonts.gstatic.com https://cdn.jsdelivr.net",
  "img-src 'self' data: blob: https:", "media-src 'self' data:",
  "connect-src 'self' https://cdn.jsdelivr.net", "worker-src 'self' blob:",
  "frame-src 'self' https: blob:", "child-src 'self' https: blob:",
  "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'", "object-src 'none'",
].join("; ");

writeFileSync(join(out, "_headers"), `/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
  Cross-Origin-Opener-Policy: same-origin-allow-popups
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  Content-Security-Policy: ${csp}

/static/*
  Cache-Control: public, max-age=31536000, immutable

/sw.js
  Cache-Control: no-cache

/*.html
  Cache-Control: no-cache
  X-Robots-Tag: noindex, nofollow

/signup.html
  X-Robots-Tag: index, follow
`);

// The app's own pages (the React router takes over from there). API/public-site rules are in netlify.toml.
writeFileSync(join(out, "_redirects"), `/            /app          302
/login       /login.html   200
/signup      /signup.html  200
/app         /index.html   200
/app/*       /index.html   200
`);

console.log(`Netlify build ready: ${hashes.length} inline script hash(es) in the CSP.`);
