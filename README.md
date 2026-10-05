# Reachout app (frontend)

The React app where people use Reachout: `/app` (the workspace), `/login` and `/signup`.

Reachout brings outreach and the job search into one place. Users send personal email (and optionally WhatsApp)
messages from their own accounts, see who replied and what they want, track every job application from their
inbox, get job matches, and build and publish their own one-page website.

| Repository | What | Hosted on |
|---|---|---|
| reachout-backend | Python API, background jobs, public user websites | Render |
| **reachout-frontend** (this one) | This React app | Netlify |
| reachout-web | Landing, contact, privacy and terms pages | Netlify |

The app has no server of its own. Netlify serves the built files and forwards `/api/*` (plus `/p/*`,
`/site-preview/*`, `/o/*`, `robots.txt`, `sitemap.xml`) to the backend behind the scenes, signing each request
(`netlify.toml`). The browser only sees the Netlify address, so the HttpOnly login cookie just works.

## What's in the app

| Area | Pages |
|---|---|
| Overview | **Dashboard** (KPIs, charts, filters), **Activity** (every message sent, by day) |
| Outreach | **Contacts** (import Excel/CSV, stages, notes), **Email finder** (HR/careers addresses from company websites → contacts), **Replies** (detected replies + suggested answers), **Templates**, **Files**, **Inbox insights** (emails by company) |
| Career | **AI job match** (marked AI: resume-based search, ranked matches with reasons, auto-apply), **Applications** (timelines from your inbox), **Job matches** (scored alerts), **Hiring posts** (scheduled emails) |
| My website | **Website & portfolio** (builder with live preview, projects from GitHub), **Leads** (contact-form messages) |
| Connected | **GitHub** (repos, editor, PRs), **LinkedIn**, **Naukri**, **WhatsApp** (hidden when the server disables it; login deleted 2 hours after linking, with a countdown) |
| Account | **Profile & email**, **Settings** (theme, notifications, delete account) |

Also: a 5-step **campaign** wizard with a live preview, a **⌘K** command palette, live notifications
(in-app, browser push), dark/light theme, collapsible sidebar, and pagination everywhere.

## Tech

React 18 · Vite 5 · Framer Motion (transitions) · Chart.js · Monaco editor (GitHub page). No UI library: the
components are in `src/ui/kit.jsx`. No state library: one React context in `src/lib/store.jsx`.

## Project layout

```
index.html                 Page shell (title/robots placeholders filled at build or by the server)
public/                    Copied as-is: icons, sw.js (push notifications service worker)
scripts/netlify-postbuild.mjs  Turns the build into a Netlify site: login/signup pages, _headers (CSP), _redirects
netlify.toml               Netlify build + signed proxy rules to the backend
extension/                 Reachout Autofill Chrome extension (zipped into public/downloads/)
src/
  main.jsx                 Entry: loads saved preferences, picks Auth or App, reports browser errors
  App.jsx                  Page registry (lazy-loaded), titles, page transitions
  layout/                  Shell (sidebar, top bar, ⌘K), Notifications, SendView (live campaign progress)
  pages/                   One file per page (see table above)
  lib/
    api.js                 fetch wrapper: CSRF header, errors → ApiError, upload with progress
    store.jsx              Shared state: account, contacts, templates, profile, counts, WhatsApp link
    router.js              Path router (/app/<page>/<param>) + legacy #page links
    format.js              Dates, numbers, safeHref() (blocks javascript:/data: links), LANDING url
    theme.js               Theme (saved server-side in a cookie, never localStorage)
  ui/                      kit.jsx (Button, Field, Drawer, Seg, Pager…), icons.js, charts.jsx, shared.jsx
  styles/                  base.css (tokens, light/dark), app.css (shell), pages.css (pages)
```

## Conventions

- **API calls** go through `api(url, { json })` from `lib/api.js`. Errors come back as `ApiError` with an
  optional `field`; use `applyError(err, setErrors)` to show them under the right input.
- **Links built from data** (emails, GitHub, user input) must go through `safeHref()`.
- **No browser storage.** Nothing goes in localStorage/sessionStorage; preferences are saved via `/api/prefs`
  (HttpOnly cookies).
- **Pages** are registered in `App.jsx` (`P` and `TITLES`) and the sidebar in `layout/Shell.jsx` (`NAV`).
- Use the kit components and CSS tokens (`var(--accent)`, `var(--surface)`…) so light and dark themes work.

## Run locally

Needs Node 20 and the backend running on `http://127.0.0.1:5050` (see the backend repo).

```bash
npm ci
npm run dev        # → http://localhost:5173/app  (proxies /api to :5050)
```

Sign in at `/login`; without email configured, the backend prints the code in its terminal.

Builds:

```bash
npm run build:netlify   # standalone site in netlify-dist/ (what Netlify runs)
npm run build           # served by the Python server itself, into ../web/dist (single-server setup)
```

## Deploy to Netlify

1. Deploy the backend first and note its address (`https://<service>.onrender.com`).
2. In `netlify.toml`, replace `reachout-api.onrender.com` with your Render address, and
   `VITE_LANDING_URL` / the `/contact` redirect with your landing site's address. Commit.
3. Netlify → **Add new site → Import from Git** → this repository. Leave *Base directory* empty; the build
   command and publish folder come from `netlify.toml`.
4. **Site configuration → Environment variables**: add `NETLIFY_PROXY_SECRET`, the same value as on Render.
5. **Change site name** to get the address you want (e.g. `reachout-app.netlify.app`) and make sure the backend's
   `SITE_URL` matches it.
6. Open `/login`, sign in with the emailed code, and you should land in `/app`.

If every API call returns "Not found", the secret differs between Netlify and Render.

Netlify cuts proxied requests after about 26 seconds; the app is built for that (live notifications reconnect,
long mailbox reads run in the background).
