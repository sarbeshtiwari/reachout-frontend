import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { emit, on } from "../lib/bus";
import { ago } from "../lib/format";
import { useApp } from "../lib/store";
import { Bar, gradient, useChartTheme } from "../ui/charts";
import { Badge, Button, Chips, Drawer, DrawerHead, Empty, Icon, Seg, Sk, fail, toast, useDebounced, Pager, usePager } from "../ui/kit";
import { Kpi } from "../ui/shared";

const FAILED = ["failed", "bounced", "invalid", "not_on_whatsapp"];
const RESULT = { sent: ["ok", "Sent"], failed: ["bad", "Failed"], bounced: ["bad", "Bounced"], invalid: ["bad", "Invalid address"], not_on_whatsapp: ["warn", "Not on WhatsApp"] };
const dayKey = ts => new Date(ts).toDateString();
const dayLabel = ts => {
  const d = new Date(ts), t = new Date();
  if (d.toDateString() === t.toDateString()) return "Today";
  if (d.toDateString() === new Date(Date.now() - 864e5).toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long", year: d.getFullYear() === t.getFullYear() ? undefined : "numeric" });
};

export default function Activity() {
  const app = useApp();
  const t = useChartTheme();
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  const [f, setF] = useState("all");
  const [ch, setCh] = useState("all");
  const [range, setRange] = useState("30");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState(false);
  const dq = useDebounced(q);
  const load = () => api("/api/history").then(r => { setRows(r); setErr(""); }).catch(e => setErr(e.message));
  useEffect(() => { load(); return on("history-changed", load); }, []);

  const since = range === "all" ? 0 : Date.now() - Number(range) * 864e5;
  const inRange = useMemo(() => (rows || []).filter(r => new Date(r.timestamp).getTime() >= since), [rows, since]);
  const vis = useMemo(() => inRange.filter(r =>
    (ch === "all" || (ch === "email" ? r.channel === "email" : r.channel !== "email"))
    && (f === "all" || (f === "failed" ? FAILED.includes(r.status) : f === "opened" ? r.opens > 0 : f === "replied" ? r.replied : r.status === f))
    && (!dq || [r.to, r.name, r.detail, r.preview].some(v => (v || "").toLowerCase().includes(dq.toLowerCase())))), [inRange, f, ch, dq]);
  const pg = usePager(vis, [f, ch, range, dq].join("|"), 50);
  const n = s => inRange.filter(r => r.status === s).length;
  const sent = n("sent"), failed = inRange.filter(r => FAILED.includes(r.status)).length;
  const tracked = inRange.filter(r => r.tracked), opened = tracked.filter(r => r.opens > 0).length;
  const replied = inRange.filter(r => r.replied).length;
  const emailsSent = inRange.filter(r => r.channel === "email" && r.status === "sent").length;

  const chart = useMemo(() => {
    const days = range === "all" ? 30 : Math.min(Number(range), 90);
    const keys = Array.from({ length: days }, (_, i) => new Date(Date.now() - (days - 1 - i) * 864e5));
    const bucket = k => (rows || []).filter(r => dayKey(r.timestamp) === k.toDateString());
    return { labels: keys.map(k => k.toLocaleDateString([], { day: "numeric", month: "short" })), sent: keys.map(k => bucket(k).filter(r => r.status === "sent").length), failed: keys.map(k => bucket(k).filter(r => FAILED.includes(r.status)).length) };
  }, [rows, range]);

  const groups = useMemo(() => {
    const out = [];
    pg.items.forEach(r => { const k = dayKey(r.timestamp); const g = out.at(-1); g && g.key === k ? g.items.push(r) : out.push({ key: k, label: dayLabel(r.timestamp), items: [r] }); });
    return out;
  }, [pg.items]);

  const check = async () => {
    setBusy(true);
    try {
      const d = await api("/api/bounces/check", { json: {} });
      const k = d.bounced.length;
      toast(k ? `Found ${k} bounced email${k === 1 ? "" : "s"}. They're marked as Bounced.` : "No new bounces.");
      await app.reload(); load(); emit("history-changed");
    } catch (e) { fail(e); }
    setBusy(false);
  };
  const at = app.data.settings.bounces_checked_at;

  return (
    <div className="act">
      <div className="act-top">
        <Seg size="sm" value={range} onChange={setRange} options={[["7", "7 days"], ["30", "30 days"], ["90", "3 months"], ["all", "All time"]]} />
        <span className="grow" />
        <span className="help">{at ? `Bounces checked ${ago(at)}` : "Bounces not checked yet"}</span>
        <Button size="sm" icon="shield" busy={busy} busyLabel="Checking…" disabled={!app.data.profile.has_password} onClick={check}>Check bounces</Button>
      </div>

      <div className="kpis five">
        {rows ? <>
          <Kpi index={0} icon="send" label="Messages" value={inRange.length} sub={`${inRange.filter(r => r.channel === "email").length} email · ${inRange.filter(r => r.channel !== "email").length} WhatsApp`} />
          <Kpi index={1} icon="check" tone="ok" label="Delivered" value={sent} sub={inRange.length ? `${Math.round(100 * sent / inRange.length)}% of attempts` : "—"} />
          <Kpi index={2} icon="alert" tone="bad" label="Failed / bounced" value={failed} sub={`${n("bounced")} bounced · ${n("not_on_whatsapp")} not on WhatsApp`} />
          <Kpi index={3} icon="eye" tone="brand" label="Opened" value={tracked.length ? Math.round(100 * opened / tracked.length) : 0} suffix="%" sub={tracked.length ? `${opened} of ${tracked.length} tracked` : "Open tracking is off"} />
          <Kpi index={4} icon="reply" tone="teal" label="Replied" value={emailsSent ? Math.round(100 * replied / emailsSent) : 0} suffix="%" sub={`${replied} of ${emailsSent} emails`} />
        </> : Array.from({ length: 5 }, (_, i) => <div key={i} className="kpi sk-card" style={{ height: 108 }} />)}
      </div>

      {rows && rows.length > 0 && <motion.div className="card act-chart" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="card-head"><h3>Sent per day</h3><span className="grow" /><span className="legend"><i className="l-ok" />Delivered<i className="l-bad" />Failed</span></div>
        <div className="chart-box short"><Bar data={{ labels: chart.labels, datasets: [
          { label: "Delivered", data: chart.sent, backgroundColor: t.accent, borderRadius: 5, maxBarThickness: 22, stack: "s" },
          { label: "Failed", data: chart.failed, backgroundColor: "#f87171", borderRadius: 5, maxBarThickness: 22, stack: "s" }] }}
          options={{ plugins: { legend: { display: false } }, interaction: { mode: "index", intersect: false }, scales: { x: { stacked: true, grid: { display: false }, ticks: { maxTicksLimit: 10, maxRotation: 0 } }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 }, grid: t.grid } } }} /></div>
      </motion.div>}

      <div className="toolbar act-filters">
        <Chips value={f} onChange={setF} options={[["all", "All", inRange.length], ["sent", "Delivered", sent], ["failed", "Failed", failed], ["opened", "Opened", opened], ["replied", "Replied", replied]]} />
        <span className="grow" />
        <Seg size="sm" value={ch} onChange={setCh} options={[["all", "All"], ["email", "Email", "mail"], ["whatsapp", "WhatsApp", "phone"]]} />
        <div className="search"><Icon name="search" /><input className="input" type="search" placeholder="Search name, address, subject…" value={q} onChange={e => setQ(e.target.value)} /></div>
      </div>

      <div className="card act-list">
        {!rows && !err && Array.from({ length: 6 }, (_, i) => <div key={i} className="act-row"><Sk w={36} h={36} r={11} /><div className="grow"><Sk w="40%" /><Sk w="60%" style={{ marginTop: 6 }} /></div></div>)}
        {err && <Empty icon="alert" title="Couldn't load activity" action={<Button size="sm" onClick={load}>Try again</Button>}>{err}</Empty>}
        {groups.map(g => (
          <section key={g.key}>
            <div className="act-day"><b>{g.label}</b><span className="help">{g.items.length} message{g.items.length === 1 ? "" : "s"}</span></div>
            {g.items.map((r, i) => {
              const [tone, label] = RESULT[r.status] || ["", r.status];
              return (
                <motion.button key={r.timestamp + r.to + i} className={`act-row ${FAILED.includes(r.status) ? "bad" : ""}`} onClick={() => setOpen(r)} initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: Math.min(i, 12) * .015 } }}>
                  <span className={`act-ic ${r.channel === "email" ? "em" : "wa"}`}><Icon name={r.channel === "email" ? "mail" : "phone"} /></span>
                  <div className="grow t"><b>{r.name || r.to}</b><span className="help">{r.name ? r.to : r.channel === "email" ? "Email" : "WhatsApp"}{r.preview ? ` · ${r.preview}` : ""}</span></div>
                  <div className="act-badges">
                    {r.replied && <Badge tone="teal"><Icon name="reply" />Replied</Badge>}
                    {r.tracked && r.opens > 0 && <Badge tone="brand"><Icon name="eye" />Opened{r.opens > 1 ? ` ${r.opens}×` : ""}</Badge>}
                    <Badge tone={tone}>{label}</Badge>
                  </div>
                  <time className="help">{new Date(r.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
                </motion.button>
              );
            })}
          </section>
        ))}
        {rows && !vis.length && <Empty icon="activity" title={rows.length ? "Nothing matches" : "No activity yet"} action={!rows.length && <a className="btn btn-sm" href="/app/campaign">Start a campaign</a>}>{rows.length ? "Try another filter or a longer period." : "Every message you send is recorded here with its result."}</Empty>}
        <Pager p={pg} label="messages" />
      </div>

      <Drawer open={!!open} onClose={() => setOpen(null)} label="Message details">
        {open && <MessageDetail r={open} onClose={() => setOpen(null)} />}
      </Drawer>
    </div>
  );
}

function MessageDetail({ r, onClose }) {
  const [tone, label] = RESULT[r.status] || ["", r.status];
  const email = r.channel === "email";
  return <>
    <DrawerHead logo={<span className={`act-ic lg ${email ? "em" : "wa"}`}><Icon name={email ? "mail" : "phone"} /></span>} title={r.name || r.to} sub={`${email ? "Email" : "WhatsApp"} · ${new Date(r.timestamp).toLocaleString()}`} onClose={onClose} />
    <div className="dr-pad">
      <div className="dr-facts">
        <div><span className="k">Result</span><Badge tone={tone}>{label}</Badge></div>
        <div><span className="k">Sent to</span><b className="clip">{r.to}</b></div>
        {r.tracked && <div><span className="k">Opened</span><b>{r.opens ? `${r.opens} time${r.opens === 1 ? "" : "s"}` : "Not yet"}</b>{r.first_open && <span className="help">first {ago(r.first_open)}</span>}</div>}
        <div><span className="k">Replied</span><b>{r.replied ? "Yes" : "Not yet"}</b></div>
        {r.source && <div className="wide"><span className="k">Source</span><b>{r.source === "sent-folder" ? "Imported from your Sent folder" : r.source}</b></div>}
      </div>
      {r.preview && <><h4 className="dr-sub">{email ? "Subject" : "Message"}</h4><p className="tl-note">{r.preview}</p></>}
      {r.detail && <><h4 className="dr-sub">Details</h4><p className={`tl-note ${FAILED.includes(r.status) ? "warn" : ""}`}>{r.detail}</p></>}
      <div className="form-actions">
        {r.rid && <a className="btn" href={`/app/contact/${r.rid}`}><Icon name="user" />Open contact</a>}
        {r.replied && <a className="btn" href="/app/replies"><Icon name="reply" />See reply</a>}
      </div>
    </div>
  </>;
}
