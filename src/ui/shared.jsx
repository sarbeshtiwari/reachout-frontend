import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { createStore, emit, useStore } from "../lib/bus";
import { ago, fmtNext } from "../lib/format";
import { Badge, Button, CountUp, Icon, Spinner, Switch, fail, modal, toast } from "./kit";

/* ---------------------------------------------------------------- statuses */
export const STAGE_TONE = { new: "", contacted: "brand", replied: "brand", interested: "ok", not_interested: "bad", won: "ok" };
export function SendBadge({ status, ts }) {
  const map = { sent: ["ok", "Sent"], failed: ["bad", "Failed"], not_on_whatsapp: ["warn", "Not on WhatsApp"], bounced: ["bad", "Bounced"], invalid: ["bad", "Invalid address"] };
  const [tone, label] = map[status] || ["", "Not sent"];
  return <Badge tone={tone} title={ts ? new Date(ts).toLocaleString() : ""}>{label}</Badge>;
}
export function EmailBadge({ r }) {
  if (r.email_opened && r.email_status === "sent")
    return <span className="badge ok" title={`First opened ${new Date(r.email_opened).toLocaleString()}. Opens are an estimate.`}><Icon name="eye" />Opened</span>;
  return <SendBadge status={r.email_status} ts={r.email_last} />;
}
export const APP_TONE = { applied: "", incomplete: "warn", in_review: "brand", assessment: "violet", shortlisted: "teal", interview: "teal", offer: "ok", rejected: "bad", closed: "muted", withdrawn: "muted" };
export const AppBadge = ({ status, statuses }) => status
  ? <span className={`badge ${APP_TONE[status] || ""}`}>{statuses?.[status]?.label || status}</span> : <span className="help">—</span>;

/* ---------------------------------------------------------------- KPI card */
export function Kpi({ href, icon, label, value, suffix = "", sub, tone = "", delta, index = 0 }) {
  const Tag = href ? motion.a : motion.div;
  return (
    <Tag href={href} className={`kpi ${tone}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * .05, duration: .35 }}
      whileHover={href ? { y: -3 } : undefined}>
      <span className="k">{icon && <span className="kpi-ic"><Icon name={icon} /></span>}{label}{delta}</span>
      <b><CountUp value={value} suffix={suffix} /></b>
      {sub && <span className="s">{sub}</span>}
    </Tag>
  );
}
export function Delta({ now, before, pts, days, hidden }) {
  if (hidden || (!before && !now)) return null;
  const diff = now - before;
  if (!diff) return <span className="delta flat" title={`Same as the previous ${days} days`}>±0</span>;
  const txt = pts ? `${diff > 0 ? "+" : ""}${diff} pts` : before ? `${diff > 0 ? "+" : ""}${Math.round(100 * diff / before)}%` : `+${diff}`;
  return <span className={`delta ${diff > 0 ? "up" : "down"}`} title={`vs the previous ${days} days (${before}${pts ? "%" : ""})`}>{diff > 0 ? "▲" : "▼"} {txt}</span>;
}

/* ---------------------------------------------------------------- mail sync (one place for Gmail sync) */
const syncStore = createStore(null);
let polling = null, loaded = false;
async function loadSync() {
  try { syncStore.set(await api("/api/mail-sync")); } catch { return; }
  if (syncStore.get()?.running) pollSync();
}
function pollSync() {
  if (polling) return;
  polling = setInterval(async () => {
    let d; try { d = await api("/api/mail-sync"); } catch { return; }
    const was = syncStore.get()?.running;
    syncStore.set(d);
    if (!d.running) { clearInterval(polling); polling = null; if (was) { emit("sync-done"); emit("apps-changed"); emit("replies-changed"); } }
  }, 2000);
}
export async function startSync(full) {
  try {
    await api("/api/mail-sync", { json: { full } });
    syncStore.set(s => ({ ...s, running: true, progress: { stage: "Starting", step: 0, steps: 5, full } }));
    pollSync();
  } catch (e) { fail(e); }
}
addEventListener("mail-sync-now", () => startSync(false));
export function useMailSync() {
  const s = useStore(syncStore);
  useEffect(() => {
    if (!loaded) { loaded = true; loadSync(); setInterval(() => { if (!syncStore.get()?.running) loadSync(); }, 60000); }
  }, []);
  return s;
}

export function MailSyncLine({ strip }) {
  const d = useMailSync();
  if (!d) return null;
  const body = !d.email_ready ? <>Mail not connected · <a href="/app/profile">Connect Gmail</a></>
    : d.running ? <><Spinner size={12} /> Syncing mail{d.progress ? `: ${d.progress.stage.toLowerCase()}…` : "…"}</>
    : <>{d.last_ok ? `Mail synced ${ago(d.last_ok)}` : "Mail not synced yet"}{d.next_run ? ` · next ${fmtNext(d.next_run)}` : ""} · <a href="/app/profile">Sync settings</a></>;
  if (!strip) return <span className="help ms-line">{body}</span>;
  return (
    <motion.div className={`card ms-strip ${d.running ? "running" : ""}`} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
      <span className="ms-ic"><Icon name={d.running ? "refresh" : "mail"} /></span><span className="help ms-line">{body}</span>
    </motion.div>
  );
}

export function MailSyncCard() {
  const d = useMailSync();
  const [prefs, setPrefs] = useState(null);
  useEffect(() => { if (d?.prefs) setPrefs(d.prefs); }, [d?.prefs]);
  if (!d) return <div className="card sk-block" style={{ height: 240 }} />;
  const p = prefs || d.prefs || {};
  const pr = d.progress;
  const pct = pr ? Math.round(100 * (pr.step + .5) / pr.steps) : 0;
  const save = async data => {
    try {
      const r = await api("/api/apps/sync-prefs", { method: "PUT", json: { ...data, tz: Intl.DateTimeFormat().resolvedOptions().timeZone } });
      setPrefs(r.prefs); syncStore.set(s => ({ ...s, prefs: r.prefs, next_run: r.prefs.auto ? r.next_run : null }));
      toast(r.prefs.auto ? `Daily sync at ${r.prefs.time}` : "Daily sync off");
    } catch (e) { fail(e); }
  };
  const parts = [["reply", "Replies", "to emails you sent, with what they're asking for"], ["briefcase", "Applications", "and their status (applied, interview, rejected, offer…)"],
    ["inbox", "Inbox insights", "every email grouped by company"], ["zap", "Job matches", "from job-alert emails"], ["alert", "Bounces", "addresses that don't exist"]];
  return (
    <div className="card card-pad mail-sync-card">
      <div className="ms-head"><h3 className="sec-h" style={{ margin: 0 }}><Icon name="refresh" />Mail sync</h3><span className="grow" />
        {d.email_ready ? <Badge tone={d.last_error ? "warn" : d.last_ok ? "ok" : ""}>{d.running ? "Syncing" : d.last_ok ? `Synced ${ago(d.last_ok)}` : "Not synced yet"}</Badge> : <Badge dot={false}>Gmail not connected</Badge>}
      </div>
      <p className="help" style={{ margin: "6px 0 14px" }}>One sync reads your Gmail for everything in Reachout. It only reads: nothing is moved, labelled or marked as read.</p>
      <ul className="ms-parts">{parts.map(([ic, b, t], i) => (
        <motion.li key={b} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * .05 }}>
          <span className={`ms-part-ic ${d.running && pr?.step === i ? "active" : pr && pr.step > i && d.running ? "done" : ""}`}><Icon name={d.running && pr && pr.step > i ? "check" : ic} /></span><span><b>{b}</b> {t}</span>
        </motion.li>))}
      </ul>
      <AnimatePresence mode="wait">
        {d.running ? (
          <motion.div key="run" className="sync-run" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
            <Spinner /><div className="grow"><b>{pr?.stage || "Starting"}…</b><span className="help">Step {(pr?.step ?? 0) + 1} of {pr?.steps || 5}{pr?.full ? " · full rescan, this takes a few minutes" : ""}. You can keep using Reachout.</span>
              <div className="progress"><motion.div animate={{ width: `${pct}%` }} transition={{ duration: .5 }} /></div></div>
          </motion.div>
        ) : d.email_ready ? (
          <motion.p key="sum" className="ms-summary" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {d.last_ok ? <><b>Last sync:</b> {d.summary || "done"}{d.last_error && <><br /><span className="warn-text">{d.last_error}</span></>}</> : "Your mailbox hasn't been read yet. The first sync reads everything and takes a few minutes."}
          </motion.p>
        ) : null}
      </AnimatePresence>
      <div className="ms-controls">
        <Switch checked={p.auto} disabled={!d.email_ready} onChange={v => save({ auto: v })}>Sync automatically every day at</Switch>
        <input className="input time-in" type="time" value={p.time || "06:00"} disabled={!p.auto || !d.email_ready} onChange={e => save({ time: e.target.value })} aria-label="Daily sync time" />
        {d.next_run && p.auto && <span className="help">Next: {fmtNext(d.next_run)}</span>}
        <span className="grow" />
        {d.email_ready && d.first_done && !d.running && <Button variant="ghost" size="sm" onClick={async () => { if (await modal({ title: "Read the whole mailbox again?", text: "Takes a few minutes. Your edits to applications and renamed companies are kept.", confirm: "Rescan" })) startSync(true); }}>Full rescan</Button>}
        <Button variant="primary" size="sm" icon="refresh" disabled={!d.email_ready || d.running} onClick={() => startSync(false)}>{d.first_done ? "Sync now" : "Sync my mailbox"}</Button>
      </div>
      <p className="help" style={{ marginTop: 10 }}>Replies are also checked every few minutes on their own. If Reachout wasn't running at the daily time, it syncs as soon as it starts.</p>
    </div>
  );
}

/* ---------------------------------------------------------------- field-name chips for message editors */
export function FieldChips({ names, onPick }) {
  return <div className="field-chips">{names.map(n => <button key={n} type="button" onClick={() => onPick(`{${n}}`)}>{`{${n}}`}</button>)}</div>;
}
// Inserts text at the caret of a textarea/input held in a ref and returns the new value.
export function insertAt(el, value, text) {
  if (!el) return value + text;
  const s = el.selectionStart ?? value.length, e = el.selectionEnd ?? value.length;
  const next = value.slice(0, s) + text + value.slice(e);
  requestAnimationFrame(() => { el.focus(); el.selectionStart = el.selectionEnd = s + text.length; });
  return next;
}

/* ---------------------------------------------------------------- dropzone */
export function Dropzone({ onFiles, accept, multiple, busy, children, className = "" }) {
  const [over, setOver] = useState(false);
  const input = useState(() => ({ el: null }))[0];
  return (
    <motion.div className={`dropzone ${over ? "over" : ""} ${busy ? "busy" : ""} ${className}`} tabIndex={0} role="button"
      onClick={() => !busy && input.el?.click()} onKeyDown={e => { if ((e.key === "Enter" || e.key === " ") && !busy) { e.preventDefault(); input.el?.click(); } }}
      onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); setOver(false); if (!busy && e.dataTransfer.files.length) onFiles([...e.dataTransfer.files]); }}
      whileHover={{ scale: busy ? 1 : 1.005 }}>
      {children}
      <input type="file" hidden accept={accept} multiple={multiple} ref={el => { input.el = el; }} onChange={e => { if (e.target.files.length) onFiles([...e.target.files]); e.target.value = ""; }} />
    </motion.div>
  );
}
