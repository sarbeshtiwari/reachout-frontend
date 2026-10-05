import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { popAnim, usePopover } from "../ui/popover";
import { LANDING } from "../lib/format";
import { api, savePref } from "../lib/api";
import { go } from "../lib/router";
import { useApp } from "../lib/store";
import { setTheme, themeChoice } from "../lib/theme";
import { Avatar, Icon, modal, spring } from "../ui/kit";
import Notifications from "./Notifications";

// Sidebar: pinned pages first, then sections that can be folded away (remembered in a cookie).
export const NAV = [
  { key: "main", group: null, items: [["dashboard", "Dashboard", "home"], ["activity", "Activity", "activity"]] },
  { key: "outreach", group: "Outreach", icon: "send", items: [["contacts", "Contacts", "users", "contacts"], ["finder", "Email finder", "search"], ["replies", "Replies", "reply", "replies"],
    ["templates", "Templates", "message"], ["files", "Files", "file"], ["inbox", "Inbox insights", "inbox"]] },
  { key: "career", group: "Career", icon: "briefcase", items: [["applications", "Applications", "briefcase", "apps"], ["jobs", "Job matches", "zap", "jobs"], ["posts", "Hiring posts", "message", "queue"]] },
  { key: "website", group: "My website", icon: "globe", items: [["portfolio", "Website & portfolio", "star"], ["leads", "Leads", "inbox", "leads"]] },
];
const HOT = ["replies", "apps", "jobs", "leads"]; // counts that mean “new, look at this”
export const ACCOUNT = [["profile", "Profile & email", "user"], ["settings", "Settings", "settings"]];
export const PAGES = [["campaign", "New campaign", "send"], ...NAV.flatMap(g => g.items)];
export const CONNECTED = [["naukri", "Naukri", "naukri"], ["linkedin", "LinkedIn", "linkedin"], ["github", "GitHub", "github"], ["whatsapp", "WhatsApp", "phone"]];

export default function Shell({ page, title, sub, children }) {
  const app = useApp();
  const [collapsed, setCollapsed] = useState(document.documentElement.dataset.sidebar === "collapsed");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [palette, setPalette] = useState(false);

  const [narrow, setNarrow] = useState(() => matchMedia("(max-width: 1000px)").matches);
  useEffect(() => {
    const mq = matchMedia("(max-width: 1000px)"), on = () => setNarrow(mq.matches);
    mq.addEventListener("change", on); return () => mq.removeEventListener("change", on);
  }, []);
  // On phones the sidebar is a full-width drawer, so the slim rail never applies there.
  useEffect(() => { document.documentElement.dataset.sidebar = collapsed && !narrow ? "collapsed" : "open"; }, [collapsed, narrow]);
  useEffect(() => { setMobileOpen(false); }, [page]);
  useEffect(() => {
    const k = e => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette(p => !p); } };
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, []);
  const toggle = () => { const c = !collapsed; setCollapsed(c); savePref({ sidebar: c ? "collapsed" : "open" }); };
  const active = page === "contact" ? "contacts" : page;
  const counts = { ...app.counts, contacts: app.data.recipients.length };

  return (
    <div className="shell">
      <Sidebar active={active} counts={counts} collapsed={collapsed && !narrow} mobileOpen={mobileOpen} toggle={toggle} openPalette={() => setPalette(true)} />
      <AnimatePresence>{mobileOpen && <motion.div className="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMobileOpen(false)} />}</AnimatePresence>

      <div className="main">
        <header className="topbar">
          <button className="top-btn menu-btn" onClick={() => setMobileOpen(true)} aria-label="Menu"><Icon name="menu" /></button>
          <div className="top-title">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={title} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: .18 }}>
                <h1>{title}</h1>{sub && <p>{sub}</p>}
              </motion.div>
            </AnimatePresence>
          </div>
          <span className="grow" />
          <JobPill />
          <div className="top-actions">
            <ThemeToggle />
            <Notifications />
            <AccountMenu />
          </div>
        </header>
        <main className="content" id="content">{children}</main>
      </div>
      <AnimatePresence>{palette && <Palette onClose={() => setPalette(false)} />}</AnimatePresence>
    </div>
  );
}

function Sidebar({ active, counts, collapsed, mobileOpen, toggle, openPalette }) {
  const app = useApp();
  const [closed, setClosed] = useState(() => new Set((document.documentElement.dataset.navClosed || "").split(" ").filter(Boolean)));
  const [tip, setTip] = useState(null);
  const fold = key => setClosed(c => {
    const n = new Set(c); n.has(key) ? n.delete(key) : n.add(key);
    savePref({ nav_closed: [...n] });
    return n;
  });
  const showTip = (e, label, extra) => {
    if (!collapsed) return;
    const r = e.currentTarget.getBoundingClientRect();
    setTip({ label, extra, top: r.top + r.height / 2, left: r.right + 12 });
  };
  const hideTip = () => setTip(null);
  useEffect(hideTip, [collapsed, active]);
  const tipProps = (label, extra) => ({ onMouseEnter: e => showTip(e, label, extra), onMouseLeave: hideTip, onFocus: e => showTip(e, label, extra), onBlur: hideTip });

  const sent = app.me?.sent_today || 0, limit = app.me?.daily_limit || 0;
  const pct = limit ? Math.min(1, sent / limit) : 0;
  const links = { naukri: app.links.naukri, linkedin: app.links.linkedin, github: app.links.github, whatsapp: app.wa.state === "connected" };

  return (
    <aside className={`sidebar ${mobileOpen ? "open" : ""}`} aria-label="Main menu">
      <div className="side-glow" aria-hidden="true" />
      <div className="side-head">
        <a href="/app/dashboard" className="brand-link" {...tipProps("Reachout")}>
          <span className="logo"><Icon name="logo" /></span>
          <span className="nav-text brand-txt"><span className="brand-name">Reachout</span><span className="brand-sub">Outreach & career</span></span>
        </a>
        <button className="collapse-btn" onClick={toggle} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} {...tipProps(collapsed ? "Expand sidebar" : "Collapse")}><Icon name="sidebar" /></button>
      </div>

      <div className="side-actions">
        <a href="/app/campaign" className={`side-cta ${active === "campaign" ? "on" : ""}`} {...tipProps("New campaign")}>
          <span className="cta-ic"><Icon name="plus" /></span><span className="nav-text">New campaign</span>
          {app.job.running && <span className="cta-live nav-text" title="A campaign is sending"><i />Live</span>}
        </a>
        <button className="palette-btn" onClick={openPalette} {...tipProps("Search", "⌘K")}>
          <Icon name="search" /><span className="nav-text">Search…</span><kbd className="nav-text">⌘K</kbd>
        </button>
      </div>

      <LayoutGroup id="nav">
        <nav className="nav">
          {NAV.map(g => {
            const isClosed = g.group && closed.has(g.key) && !collapsed;
            const hasActive = g.items.some(([id]) => id === active);
            const hot = g.items.reduce((n, [, , , k]) => n + (k && HOT.includes(k) ? counts[k] || 0 : 0), 0);
            return (
              <div key={g.key} className={`nav-group ${isClosed ? "closed" : ""}`}>
                {g.group && (
                  <button className={`nav-label ${hasActive ? "has-active" : ""}`} onClick={() => fold(g.key)} aria-expanded={!isClosed} tabIndex={collapsed ? -1 : 0}>
                    <span className="nav-text">{g.group}</span>
                    {isClosed && hot > 0 && <span className="nav-text label-count">{hot}</span>}
                    <Icon name="chevron-down" className="nav-text label-caret" />
                  </button>
                )}
                <AnimatePresence initial={false}>
                  {(!isClosed || hasActive) && (
                    <motion.div className="nav-items" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: .2, ease: [.2, .8, .2, 1] }}>
                      {g.items.filter(([id]) => !isClosed || id === active).map(([id, label, ic, countKey]) => {
                        const n = countKey ? counts[countKey] || 0 : 0;
                        const isHot = HOT.includes(countKey);
                        return (
                          <a key={id} href={`/app/${id}`} className={active === id ? "active" : ""} aria-current={active === id ? "page" : undefined} {...tipProps(label, n ? `${n}${isHot ? " new" : ""}` : "")}>
                            {active === id && <motion.span className="nav-bg" layoutId="nav-active" transition={spring} />}
                            <span className="nav-ic"><Icon name={ic} />{n > 0 && isHot && <span className="ic-dot" />}</span>
                            <span className="nav-text">{label}</span>
                            {n > 0 && <motion.span key={n} className={`count nav-text ${isHot ? "new" : ""}`} initial={{ scale: .6 }} animate={{ scale: 1 }}>{n > 999 ? "999+" : n}</motion.span>}
                          </a>
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </nav>
      </LayoutGroup>

      <div className="side-foot">
        <div className="side-conn">
          <span className="nav-text side-conn-label">Connected</span>
          <div className="side-conn-row">
            {CONNECTED.filter(([id]) => id !== "whatsapp" || app.me?.whatsapp !== false).map(([id, label, ic]) => (
              <a key={id} href={`/app/${id}`} className={`conn ${links[id] ? "on" : ""} ${active === id ? "active" : ""}`} aria-label={`${label}: ${links[id] ? "connected" : "not connected"}`}
                {...(collapsed ? tipProps(label, links[id] ? "Connected" : "Not connected") : { title: `${label} · ${links[id] ? "connected" : "not connected"}` })}>
                <Icon name={ic} /><i />
              </a>))}
          </div>
        </div>
        <a href="/app/activity" className="side-usage" {...tipProps("Sent today", `${sent} of ${limit}`)}>
          <svg viewBox="0 0 36 36" className="usage-ring" aria-hidden="true">
            <circle cx="18" cy="18" r="15" />
            <motion.circle cx="18" cy="18" r="15" initial={{ strokeDashoffset: 94.25 }} animate={{ strokeDashoffset: 94.25 * (1 - pct) }} transition={{ duration: .8, ease: [.2, .8, .2, 1] }} className={pct >= .9 ? "hot" : ""} />
          </svg>
          <span className="usage-n">{sent}</span>
          <span className="nav-text usage-txt"><b>{sent} of {limit} sent today</b><small>{limit - sent > 0 ? `${limit - sent} left · resets at midnight` : "Limit reached · resets at midnight"}</small></span>
        </a>
      </div>

      {createPortal(
        <AnimatePresence>
          {tip && (
            <motion.div className="side-tip" style={{ top: tip.top, left: tip.left }} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: .12 }}>
              {tip.label}{tip.extra && <span>{tip.extra}</span>}
            </motion.div>
          )}
        </AnimatePresence>, document.body)}
    </aside>
  );
}

function JobPill() {
  const { job } = useApp();
  if (!job.running) return null;
  return (
    <motion.button className="job-pill" initial={{ opacity: 0, scale: .8 }} animate={{ opacity: 1, scale: 1 }} onClick={() => dispatchEvent(new Event("open-sendview"))} title="Open the sending screen">
      <span className="pulse" /><span>{job.dry_run ? "Test run" : "Sending"} {job.done}/{job.total || "…"}</span>
    </motion.button>
  );
}

function ThemeToggle() {
  const [dark, setDark] = useState(document.documentElement.dataset.theme === "dark");
  useEffect(() => { const f = () => setDark(document.documentElement.dataset.theme === "dark"); addEventListener("themechange", f); return () => removeEventListener("themechange", f); }, []);
  return (
    <button className="top-btn theme-btn" onClick={() => setTheme(dark ? "light" : "dark")} aria-label={dark ? "Switch to light mode" : "Switch to dark mode"} title={dark ? "Light mode" : "Dark mode"}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span key={dark ? "m" : "s"} initial={{ rotate: -90, opacity: 0, scale: .5 }} animate={{ rotate: 0, opacity: 1, scale: 1 }} exit={{ rotate: 90, opacity: 0, scale: .5 }} transition={{ duration: .22 }} style={{ display: "grid" }}>
          <Icon name={dark ? "moon" : "sun"} />
        </motion.span>
      </AnimatePresence>
    </button>
  );
}

function AccountMenu() {
  const app = useApp();
  const { open, setOpen, ref } = usePopover();
  const [choice, setChoice] = useState(themeChoice());
  const me = app.me || {};
  const dots = { naukri: app.links.naukri, linkedin: app.links.linkedin, github: app.links.github, whatsapp: app.wa.state === "connected", profile: !!app.data.profile.has_password };
  const logout = async () => {
    if (app.job.running && !await modal({ title: "Sending is still in progress", text: "The campaign keeps sending after you log out. To stop it, use Stop sending first.", confirm: "Log out anyway" })) return;
    await api("/api/auth/logout", { json: {} }).catch(() => {});
    location.href = LANDING;
  };
  const logoutAll = async () => {
    if (!await modal({ title: "Log out everywhere?", text: "Every browser and device signed in to your account is logged out, including this one. Use this if you signed in on a shared computer.", confirm: "Log out everywhere", danger: true })) return;
    await api("/api/auth/logout-everywhere", { json: {} }).catch(() => {});
    location.href = "/login";
  };
  const pick = c => { setChoice(c); setTheme(c); };
  return (
    <div className="pop-wrap" ref={ref}>
      <button className="avatar-btn" onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open} title={`${me.name || ""} · ${me.email || ""}`}>
        <Avatar name={me.name || "?"} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div className="popover me-pop" role="menu" {...popAnim} onClick={e => e.target.closest("a") && setOpen(false)}>
            <div className="me-card"><Avatar name={me.name || "?"} size="lg" /><div className="who"><b>{me.name}</b><span>{me.email}</span></div></div>
            {ACCOUNT.map(([id, label, ic]) => <a key={id} role="menuitem" href={`/app/${id}`}><Icon name={ic} />{label}{id === "profile" && <span className={`dot ${dots.profile ? "on" : ""}`} />}</a>)}
            <div className="me-label">Connected accounts</div>
            {CONNECTED.filter(([id]) => id !== "whatsapp" || me.whatsapp !== false).map(([id, label, ic]) => <a key={id} role="menuitem" href={`/app/${id}`}><Icon name={ic} />{label}<span className={`dot ${dots[id] ? "on" : ""}`} title={dots[id] ? "Connected" : "Not connected"} /></a>)}
            <div className="me-theme" role="group" aria-label="Theme">
              {[["light", "Light", "sun"], ["dark", "Dark", "moon"], ["system", "Auto", "monitor"]].map(([v, l, ic]) => (
                <button key={v} aria-pressed={choice === v} onClick={() => pick(v)}>
                  {choice === v && <motion.span className="me-theme-bg" layoutId="theme-pick" transition={spring} />}
                  <span><Icon name={ic} />{l}</span>
                </button>
              ))}
            </div>
            <button role="menuitem" onClick={logoutAll}><Icon name="shield" />Log out on all devices</button>
            <button role="menuitem" className="danger" onClick={logout}><Icon name="logout" />Log out</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ---------------------------------------------------------------- command palette (⌘K) */
function Palette({ onClose }) {
  const app = useApp();
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const input = useRef(null);
  useEffect(() => { input.current?.focus(); }, []);
  const items = useMemo(() => {
    const pages = [...PAGES, ...ACCOUNT, ...CONNECTED.filter(([id]) => id !== "whatsapp" || app.me?.whatsapp !== false)]
      .map(([id, label, ic]) => ({ key: "p" + id, label, hint: "Page", icon: ic, to: id }));
    const actions = [
      { key: "a-new", label: "Start a new campaign", hint: "Action", icon: "send", to: "campaign" },
      { key: "a-add", label: "Add an application", hint: "Action", icon: "plus", to: "applications?add=1" },
      { key: "a-sync", label: "Sync my Gmail now", hint: "Action", icon: "refresh", run: () => dispatchEvent(new Event("mail-sync-now")) },
      { key: "a-theme", label: "Toggle dark mode", hint: "Action", icon: "moon", run: () => setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark") },
    ];
    const contacts = q.length > 1 ? app.data.recipients.filter(r => [r.name, r.company, r.email, r.phone].some(v => (v || "").toLowerCase().includes(q.toLowerCase())))
      .slice(0, 6).map(r => ({ key: "c" + r.id, label: r.name || r.email || r.phone, hint: r.company || "Contact", icon: "user", to: "contact/" + r.id })) : [];
    const all = [...actions, ...pages, ...contacts];
    const s = q.trim().toLowerCase();
    return s ? all.filter(x => (x.label + " " + x.hint).toLowerCase().includes(s)) : [...actions, ...pages];
  }, [q, app]);
  useEffect(() => setI(0), [q]);
  const pick = it => { onClose(); if (it.run) it.run(); else go(it.to); };
  const onKey = e => {
    if (e.key === "ArrowDown") { e.preventDefault(); setI(x => Math.min(items.length - 1, x + 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setI(x => Math.max(0, x - 1)); }
    if (e.key === "Enter" && items[i]) pick(items[i]);
    if (e.key === "Escape") onClose();
  };
  return (
    <motion.div className="modal-backdrop palette-back" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <motion.div className="palette" initial={{ opacity: 0, y: -20, scale: .97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10, scale: .98 }} transition={spring}>
        <div className="pal-in"><Icon name="search" /><input ref={input} value={q} onChange={e => setQ(e.target.value)} onKeyDown={onKey} placeholder="Search pages, actions and contacts…" aria-label="Search" /><kbd>Esc</kbd></div>
        <div className="pal-list">
          {items.length ? items.map((it, n) => (
            <button key={it.key} className={n === i ? "on" : ""} onMouseEnter={() => setI(n)} onClick={() => pick(it)}>
              {n === i && <motion.span className="pal-bg" layoutId="pal" transition={{ type: "spring", stiffness: 600, damping: 40 }} />}
              <span className="pal-ic"><Icon name={it.icon} /></span><span className="pal-l">{it.label}</span><span className="help">{it.hint}</span>
            </button>
          )) : <div className="help" style={{ padding: 18, textAlign: "center" }}>Nothing matches “{q}”.</div>}
        </div>
        <div className="pal-foot help"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>↵</kbd> open</span><span><kbd>⌘K</kbd> toggle</span></div>
      </motion.div>
    </motion.div>
  );
}

