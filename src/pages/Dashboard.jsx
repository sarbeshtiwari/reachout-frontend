import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { on } from "../lib/bus";
import { addDays, ago, fmtDT, fmtDate, initials, today } from "../lib/format";
import { go, replacePath } from "../lib/router";
import { useApp } from "../lib/store";
import { Bar, Doughnut, Line, centerText, gradient, useChartTheme } from "../ui/charts";
import { Avatar, Badge, Empty, Icon, Seg, Sk } from "../ui/kit";
import { AppBadge, Delta, Kpi, MailSyncLine, SendBadge, STAGE_TONE } from "../ui/shared";

const TONES = { applied: "#94a3b8", incomplete: "#f59e0b", in_review: "#6366f1", assessment: "#8b5cf6", shortlisted: "#14b8a6", interview: "#0d9488", offer: "#16a34a", rejected: "#ef4444", closed: "#9ca3af", withdrawn: "#cbd5e1" };
const RANGES = [["7", "7 days"], ["30", "30 days"], ["90", "3 months"], ["365", "12 months"], ["0", "All time"], ["custom", "Custom"]];

export default function Dashboard({ route }) {
  const app = useApp();
  const q = route.query;
  const [tab, setTab] = useState("all");
  const [f, setF] = useState(() => ({
    range: q.get("from") || q.get("to") ? "custom" : ["7", "30", "90", "365", "0"].includes(q.get("days")) ? q.get("days") : "365",
    from: q.get("from") || "", to: q.get("to") || "", portal: q.get("portal") || "", status: q.get("status") || "",
  }));
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [history, setHistory] = useState(null);

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (f.range === "custom") { if (f.from) p.set("from", f.from); if (f.to) p.set("to", f.to); } else p.set("days", f.range);
    if (f.portal) p.set("portal", f.portal);
    if (f.status) p.set("status", f.status);
    return p.toString();
  }, [f]);

  useEffect(() => {
    let live = true;
    setLoading(true);
    replacePath("dashboard" + (qs === "days=365" ? "" : "?" + qs));
    api("/api/overview?" + qs).then(r => { if (live) { setD(r); setErr(""); } }).catch(e => live && setErr(e.message)).finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [qs]);
  useEffect(() => {
    const load = () => api("/api/history").then(setHistory).catch(() => setHistory([]));
    load();
    const offs = [on("history-changed", load), on("sync-done", () => api("/api/overview?" + qs).then(setD).catch(() => {}))];
    return () => offs.forEach(x => x());
  }, [qs]);

  const set = changes => setF(x => ({ ...x, ...changes }));
  const show = g => g.split(" ").includes(tab);

  return (
    <div className="dash">
      <div className="dash-head">
        <Seg value={tab} onChange={setTab} options={[["all", "At a glance", "grid"], ["apps", "Applications", "briefcase"], ["outreach", "Outreach", "send"]]} />
        <span className="grow" />
        <MailSyncLine />
      </div>

      {show("all apps") && (
        <motion.div className="card dash-filters" layout>
          <Seg value={f.range} onChange={v => {
            if (v === "custom") set({ range: v, from: f.from || addDays(-29), to: f.to || today() }); else set({ range: v });
          }} options={RANGES} size="sm" />
          <AnimatePresence>{f.range === "custom" && (
            <motion.div className="df-custom" initial={{ opacity: 0, width: 0 }} animate={{ opacity: 1, width: "auto" }} exit={{ opacity: 0, width: 0 }}>
              <input className="input" type="date" value={f.from} max={f.to || undefined} onChange={e => e.target.value && set({ from: e.target.value })} aria-label="From" />
              <span className="help">to</span>
              <input className="input" type="date" value={f.to} min={f.from || undefined} max={today()} onChange={e => e.target.value && set({ to: e.target.value })} aria-label="To" />
            </motion.div>)}</AnimatePresence>
          <select className="select" value={f.portal} onChange={e => set({ portal: e.target.value })} aria-label="Applied through">
            <option value="">All sources</option>
            {(d?.filters.portals || []).map(([p, n]) => <option key={p} value={p}>{p} ({n})</option>)}
          </select>
          <select className="select" value={f.status} onChange={e => set({ status: e.target.value })} aria-label="Status">
            <option value="">All statuses</option><option value="active">In progress</option><option value="heard">Heard back</option>
            <option value="interview">Interviews / assessments</option><option value="offer">Offers</option><option value="rejected">Not selected</option>
          </select>
          <span className="grow" />
          {d && <span className="help nowrap">{fmtDate(d.filters.from)} – {fmtDate(d.filters.to)}</span>}
          {(f.range !== "365" || f.portal || f.status) && <button className="link-btn" onClick={() => setF({ range: "365", from: "", to: "", portal: "", status: "" })}>Reset</button>}
        </motion.div>
      )}

      {err ? <div className="card"><Empty icon="alert" title="Couldn't load the overview">{err}</Empty></div>
        : !d ? <div className="kpis">{Array.from({ length: 6 }, (_, i) => <div key={i} className="kpi sk-card" style={{ height: 112 }} />)}</div>
        : <div className={loading ? "dash-body loading" : "dash-body"}><Glance d={d} f={f} set={set} show={show} app={app} /></div>}

      {show("all outreach") && <Outreach app={app} history={history} />}
    </div>
  );
}

function Glance({ d, f, show, app }) {
  const t = useChartTheme();
  const a = d.apps, o = d.outreach, pv = a.prev;
  const all = f.range === "0";
  const days = d.filters.days;
  const unit = d.filters.unit;
  const label = k => unit === "month" ? new Date(k + "-01T00:00").toLocaleDateString([], { month: "short", year: "2-digit" }) : new Date(k + "T00:00").toLocaleDateString([], { day: "numeric", month: "short" });
  const st = Object.entries(a.by_status).filter(([, n]) => n);
  const top = Math.max(1, a.funnel[0][1]);
  const statusLabel = k => d.statuses[k]?.label || k;
  const p = d.platforms;
  return <>
    <div className="kpis">
      <Kpi index={0} href="/app/applications" icon="briefcase" label="Applications" value={a.total} sub={`${a.active} in progress · ${a.this_week} this week`} delta={<Delta now={a.total} before={pv.total} days={days} hidden={all} />} />
      <Kpi index={1} href="/app/applications" icon="trend" tone="brand" label="Response rate" value={a.response_rate} suffix="%" sub={`${a.responded} companies replied`} delta={<Delta now={a.response_rate} before={pv.response_rate} pts days={days} hidden={all} />} />
      <Kpi index={2} href="/app/applications" icon="calendar" tone="teal" label="Interviews" value={a.interviews} sub={a.upcoming.length ? `${a.upcoming.length} coming up` : "none scheduled"} delta={<Delta now={a.interviews} before={pv.interviews} days={days} hidden={all} />} />
      <Kpi index={3} href="/app/applications" icon="star" tone="ok" label="Offers" value={a.offers} sub={`${a.rejected} not selected`} delta={<Delta now={a.offers} before={pv.offers} days={days} hidden={all} />} />
      <Kpi index={4} href="/app/activity" icon="mail" label="Outreach sent" value={o.emailed + o.whatsapp} sub={`${o.opened} opened · ${o.replied} replied · ${o.bounced} failed`} delta={<Delta now={o.emailed + o.whatsapp} before={o.prev_sent} days={days} hidden={all} />} />
      <Kpi index={5} href="/app/jobs" icon="zap" tone="violet" label="Job matches" value={d.jobs.matches} sub={`${d.jobs.total} from alerts · ${d.queued} scheduled`} />
    </div>
    <div className="glance-grid">
      {show("all apps") && <motion.div className="card chart-card span-2" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .1 }}>
        <div className="card-head"><h3>Applications per {unit}</h3><span className="grow" /><span className="help">{fmtDate(d.filters.from)} – {fmtDate(d.filters.to)}</span></div>
        <div className="chart-box"><Bar data={{ labels: a.months.map(m => label(m.month)), datasets: [
          { label: "Applied", data: a.months.map(m => m.applied), backgroundColor: gradient(t.accent, t.accent2), borderRadius: 6, maxBarThickness: 26 },
          { label: "Moved forward", data: a.months.map(m => m.progress), backgroundColor: "#14b8a6", borderRadius: 6, maxBarThickness: 26 },
          { label: "Not selected", data: a.months.map(m => m.rejected), backgroundColor: "#f87171", borderRadius: 6, maxBarThickness: 26 }] }}
          options={{ interaction: { mode: "index", intersect: false }, scales: { x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 12 } }, y: { beginAtZero: true, ticks: { precision: 0 }, grid: t.grid } }, plugins: { legend: { position: "bottom" } } }} /></div>
      </motion.div>}
      {show("all apps") && <motion.div className="card chart-card" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .15 }}>
        <div className="card-head"><h3>Where things stand</h3></div>
        <div className="chart-box">{st.length ? <Doughnut data={{ labels: st.map(([k]) => statusLabel(k)), datasets: [{ data: st.map(([, n]) => n), backgroundColor: st.map(([k]) => TONES[k]), borderColor: t.surface, borderWidth: 3, hoverOffset: 8 }] }}
          options={{ cutout: "68%", plugins: { legend: { position: "right" } }, onClick: (e, els) => els[0] && go("applications") }} plugins={[centerText(a.total, "applications")]} /> : <Empty icon="briefcase" title="Nothing in this period" />}</div>
      </motion.div>}
      {show("all apps") && <motion.div className="card chart-card" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .2 }}>
        <div className="card-head"><h3>Hiring funnel</h3></div>
        <div className="funnel">
          {a.funnel.map(([l, n], i) => (
            <div className="fn-row" key={l}><span className="fn-l">{l}</span>
              <div className="fn-bar"><motion.i initial={{ width: 0 }} animate={{ width: `${Math.max(n ? 3 : 0, 100 * n / top)}%` }} transition={{ delay: .25 + i * .08, duration: .7, ease: [.2, .8, .2, 1] }} style={{ opacity: 1 - i * .1 }} /></div>
              <b>{n}</b></div>
          ))}
          <p className="help">{a.total ? `${Math.round(100 * a.funnel[3][1] / top)}% of applications reached an interview.` : "Sync your mail to see your funnel."}</p>
        </div>
      </motion.div>}
      {show("all outreach") && <motion.div className="card chart-card span-2" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .25 }}>
        <div className="card-head"><h3>Outreach per {unit}</h3><span className="grow" /><a className="btn btn-sm btn-ghost" href="/app/activity">Activity</a></div>
        <div className="chart-box"><Line data={{ labels: o.by_day.map(x => label(x.day)), datasets: [
          { label: "Email", data: o.by_day.map(x => x.email), borderColor: t.accent, backgroundColor: gradient("rgba(99,102,241,.28)", "rgba(99,102,241,0)"), fill: true, tension: .38, pointRadius: 0, pointHoverRadius: 5, borderWidth: 2.2 },
          { label: "WhatsApp", data: o.by_day.map(x => x.whatsapp), borderColor: "#16a34a", backgroundColor: gradient("rgba(22,163,74,.18)", "rgba(22,163,74,0)"), fill: true, tension: .38, pointRadius: 0, pointHoverRadius: 5, borderWidth: 2.2 },
          { label: "Failed / bounced", data: o.by_day.map(x => x.failed), borderColor: "#ef4444", borderDash: [4, 4], tension: .38, pointRadius: 0, borderWidth: 1.6 }] }}
          options={{ interaction: { mode: "index", intersect: false }, scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 8, maxRotation: 0 } }, y: { beginAtZero: true, ticks: { precision: 0 }, grid: t.grid } }, plugins: { legend: { position: "bottom" } } }} /></div>
      </motion.div>}
      {show("all apps") && <motion.div className="card chart-card" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .3 }}>
        <div className="card-head"><h3>Applied through</h3></div>
        <div className="chart-box"><Bar data={{ labels: a.portals.map(x => x[0]), datasets: [{ data: a.portals.map(x => x[1]), backgroundColor: gradient(t.accent, t.accent2), borderRadius: 6, maxBarThickness: 18 }] }}
          options={{ indexAxis: "y", scales: { x: { beginAtZero: true, ticks: { precision: 0 }, grid: t.grid }, y: { grid: { display: false } } }, plugins: { legend: { display: false } } }} /></div>
      </motion.div>}
      {show("all apps") && <motion.div className="card span-2" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .35 }}>
        <div className="card-head"><h3>Latest application updates</h3><span className="grow" /><a className="btn btn-sm" href="/app/applications">All applications</a></div>
        {a.recent.length ? <div className="mini-list">{a.recent.map((x, i) => (
          <motion.a key={x.id} href={`/app/applications/${x.id}`} className="mini-row" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: .4 + i * .03 }}>
            <Avatar name={x.company} logo /><div className="t"><b>{x.company}</b><span className="help">{x.role || "Position not stated"}</span></div>
            <div className="mr-st"><AppBadge status={x.status} statuses={d.statuses} />{x.prev_status && <span className="help was">was {statusLabel(x.prev_status)}</span>}</div>
            <span className="help nowrap">{ago(x.updated_at)}</span>
          </motion.a>))}</div>
          : <Empty icon="briefcase" title="No applications yet" action={<a className="btn btn-sm" href="/app/applications">Open Applications</a>}>Sync your mail to find the jobs you've applied for.</Empty>}
      </motion.div>}
      {show("all apps") && <motion.div className="card" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .4 }}>
        <div className="card-head"><h3>Upcoming interviews</h3></div>
        {a.upcoming.length ? a.upcoming.map(x => <a key={x.id} className="feed-item" href={`/app/applications/${x.id}`}><span className="ch iv"><Icon name="calendar" /></span><span className="t"><b>{x.company}</b><span>{x.role || "Interview"} · {fmtDT(x.interview_at)}</span></span></a>)
          : <Empty icon="calendar" title="No interviews scheduled">Interview invites found in your mail appear here.</Empty>}
      </motion.div>}
      {show("all") && <motion.div className="card span-3" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .45 }}>
        <div className="card-head"><h3>Connected accounts</h3></div>
        <div className="plat-grid">
          <Plat href="/app/profile" icon="mail" cls="em" name="Email" on={p.email} line={p.email ? `${o.emailed} sent · ${o.opened} opened · ${o.replied} replied` : "Needed to send and to sync applications"} />
          <Plat href="/app/naukri" icon="naukri" cls="nk" name="Naukri" on={p.naukri.connected} line={p.naukri.connected ? `${p.naukri.applications} applications · ${p.naukri.recruiter_activity} with recruiter activity` : "Track Naukri applies and recruiter views"} />
          <Plat href="/app/linkedin" icon="linkedin" cls="li" name="LinkedIn" on={p.linkedin.connected} line={p.linkedin.connected ? `${p.linkedin.name || ""} · ${p.linkedin.posts} posts from Reachout` : "Post and schedule updates"} />
          <Plat href="/app/github" icon="github" cls="gh" name="GitHub" on={p.github.connected} line={p.github.connected ? (p.github.error || `@${p.github.login} · ${p.github.repos} repos · ★ ${p.github.stars}`) : "Edit repos and READMEs"} />
          {app.me?.whatsapp !== false && <Plat href="/app/whatsapp" icon="phone" cls="wa" name="WhatsApp" on={app.wa.state === "connected"} line={`${o.whatsapp} messages sent`} />}
        </div>
      </motion.div>}
    </div>
  </>;
}

const Plat = ({ href, icon, cls, name, on, line }) => (
  <motion.a className={`plat ${on ? "on" : ""}`} href={href} whileHover={{ y: -2 }}>
    <span className={`plat-ic ${cls}`}><Icon name={icon} /></span>
    <div className="grow"><b>{name}</b><span className="help">{line}</span></div>
    <Badge tone={on ? "ok" : ""} dot={on}>{on ? "Connected" : "Connect"}</Badge>
  </motion.a>
);

function Outreach({ app, history }) {
  const r = app.data.recipients, me = app.me;
  const pct = Math.min(100, 100 * (me.sent_today || 0) / (me.daily_limit || 1));
  const due = r.filter(x => x.follow_up && !["won", "not_interested"].includes(x.stage) && x.follow_up <= addDays(7)).sort((a, b) => a.follow_up.localeCompare(b.follow_up));
  const overdue = due.filter(x => x.follow_up <= today()).length;
  const steps = [
    [r.length > 0, "Add your contacts", "Import an Excel sheet or add people by hand", "contacts"],
    [app.data.templates.some(t => !/<[a-z][^<>]*>/i.test(t.body)), "Personalise your message", "Replace the <placeholders> in the template with your details", "templates"],
    [app.data.documents.length > 0, "Upload a file (optional)", "Like a resume or brochure, to attach to messages", "files"],
    [app.wa.state === "connected" || app.data.profile.has_password, "Connect WhatsApp or email", "Scan a QR code, or add a Gmail app password", "profile"],
    [(history || []).length > 0, "Send your first campaign", "Try a test run first to check everything", "campaign"],
  ];
  const done = steps.filter(s => s[0]).length;
  return <>
    <h2 className="sec-title">Outreach</h2>
    <div className="kpis four">
      <Kpi index={0} icon="users" label="Contacts" value={r.length} sub={`${r.filter(x => !x.wa_status && !x.email_status).length} not contacted yet`} />
      <Kpi index={1} icon="phone" label="Sent on WhatsApp" value={r.filter(x => x.wa_status === "sent").length} sub={`${r.filter(x => x.wa_status === "not_on_whatsapp").length} not on WhatsApp`} />
      <Kpi index={2} icon="mail" label="Sent by email" value={r.filter(x => x.email_status === "sent").length} sub={`${r.filter(x => x.email_opened).length} opened · ${r.filter(x => ["failed", "bounced", "invalid"].includes(x.email_status)).length} bounced`} />
      <motion.div className="kpi" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .15 }}>
        <span className="k"><span className="kpi-ic"><Icon name="clock" /></span>Sent today</span><b>{me.sent_today || 0}<small> of {me.daily_limit}</small></b>
        <div className="progress"><motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: .8 }} /></div>
      </motion.div>
    </div>
    {due.length > 0 && <motion.div className="card" style={{ marginBottom: 16 }} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <div className="card-head"><h3>Follow-ups</h3><span className="grow" /><Badge tone={overdue ? "warn" : "brand"} dot={false}>{overdue ? `${overdue} due` : `${due.length} this week`}</Badge></div>
      {due.slice(0, 6).map(x => (
        <a key={x.id} className="feed-item" href={`/app/contact/${x.id}`}>
          <span className="avatar">{initials(x.name || x.company || x.email)}</span>
          <span className="t"><b>{x.name || x.company || x.phone || x.email}</b><span>{x.company && x.name ? x.company : (x.phone || x.email || "")}</span></span>
          <span className={`due ${x.follow_up <= today() ? "late" : ""}`}><Icon name="clock" />{x.follow_up < today() ? `Overdue · ${fmtDate(x.follow_up)}` : x.follow_up === today() ? "Today" : fmtDate(x.follow_up)}</span>
          <Badge tone={STAGE_TONE[x.stage || "new"]}>{me.stages[x.stage || "new"]}</Badge>
        </a>))}
    </motion.div>}
    <div className="grid-2">
      <div className="card">
        <div className="card-head"><h3>Get started</h3><span className="grow" /><Badge tone="brand" dot={false}>{done === steps.length ? "All done" : `${done} of ${steps.length} done`}</Badge></div>
        <div className="setup-bar"><motion.div initial={{ width: 0 }} animate={{ width: `${100 * done / steps.length}%` }} transition={{ duration: .8 }} /></div>
        <div className="checklist">{steps.map(([ok, t, dsc, href], i) => (
          <motion.a key={t} className={`check-item ${ok ? "done" : ""}`} href={`/app/${href}`} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * .05 }}>
            <span className="tick">{ok ? <Icon name="check" /> : i + 1}</span><span className="grow"><b>{t}</b><span className="d">{dsc}</span></span><Icon name="chevron" className="arrow" />
          </motion.a>))}</div>
      </div>
      <div className="card">
        <div className="card-head"><h3>Recent activity</h3><span className="grow" /><a href="/app/activity" className="btn btn-sm">View all</a></div>
        {history === null ? Array.from({ length: 4 }, (_, i) => <div key={i} className="feed-item"><Sk w={34} h={34} r={10} /><span className="t"><Sk w="60%" /><Sk w="40%" style={{ marginTop: 6 }} /></span></div>)
          : history.length ? history.slice(0, 6).map((h, i) => (
            <motion.div key={i} className="feed-item" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * .04 }}>
              <span className={`ch ${h.channel === "email" ? "em" : "wa"}`}><Icon name={h.channel === "email" ? "mail" : "phone"} /></span>
              <span className="t"><b>{h.name || h.to}</b><span>{h.name ? h.to + " · " : ""}{h.channel === "email" ? "Email" : "WhatsApp"} · {ago(h.timestamp)}</span></span>
              <SendBadge status={h.status} />
            </motion.div>))
          : <Empty icon="activity" title="No messages yet" action={<a className="btn btn-sm" href="/app/campaign">Create a campaign</a>}>Messages you send will appear here.</Empty>}
      </div>
    </div>
  </>;
}

