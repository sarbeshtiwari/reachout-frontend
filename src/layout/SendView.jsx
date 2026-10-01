import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import { fmtDur } from "../lib/format";
import { go } from "../lib/router";
import { useApp } from "../lib/store";
import { Icon, fail, modal, toast } from "../ui/kit";

// Turns "12:01:05  Priya → sent" server lines into rows with a tone.
export function logRows(lines) {
  return (lines || []).map((l, i) => {
    const time = l.slice(0, 8).trim(), text = l.slice(10) || l.trim();
    const tone = /→ sent/.test(text) ? "sent" : /→ failed|^Error/.test(text) ? "bad" : /not_on_whatsapp|limit/.test(text) ? "warn" : /^Waiting|^ {2}|^—/.test(text) ? "dim" : "";
    return { key: i, time, text: text.replace("not_on_whatsapp", "not on WhatsApp"), tone };
  });
}

// Full-screen mission-control view while a campaign sends.
export default function SendView() {
  const { job, setJob, data } = useApp();
  const [background, setBackground] = useState(false);
  const [dismissed, setDismissed] = useState(!job.running);
  const [now, setNow] = useState(Date.now());
  const offset = useRef(0);
  const logRef = useRef(null);
  const started = useRef(job.running);

  useEffect(() => {
    if (job.running && !started.current) { setBackground(false); setDismissed(false); }
    started.current = job.running;
  }, [job.running]);
  useEffect(() => { const f = () => { setBackground(false); setDismissed(false); }; addEventListener("open-sendview", f); return () => removeEventListener("open-sendview", f); }, []);
  useEffect(() => { if (typeof job.now === "number") offset.current = job.now * 1000 - Date.now(); }, [job.now]);
  useEffect(() => { if (!job.running) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [job.running]);
  useEffect(() => { const el = logRef.current; if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 60) el.scrollTop = 1e9; }, [job.lines]);

  const ended = !job.running && job.total && job.finished;
  const show = (job.running && !background) || (ended && !background && !dismissed);
  useEffect(() => {
    if (!show) return;
    const k = e => { if (e.key === "Escape") job.running ? toBackground() : close(); };
    addEventListener("keydown", k); document.body.classList.add("sv-open");
    return () => { removeEventListener("keydown", k); document.body.classList.remove("sv-open"); };
  });
  useEffect(() => { if (job.running) document.title = `(${job.done}/${job.total || "…"}) Sending · Reachout`; }, [job.running, job.done, job.total]);

  const ticks = useMemo(() => Array.from({ length: 60 }, (_, i) => {
    const a = (i / 60) * Math.PI * 2 - Math.PI / 2, r1 = 124, r2 = i % 5 ? 130 : 136;
    return [150 + r1 * Math.cos(a), 150 + r1 * Math.sin(a), 150 + r2 * Math.cos(a), 150 + r2 * Math.sin(a)];
  }), []);

  const toBackground = () => { setBackground(true); toast("Sending continues in the background. Click the progress pill at the top to reopen this screen."); };
  const close = () => setDismissed(true);
  const stop = async () => {
    if (!await modal({ title: "Stop sending?", text: `${job.done} of ${job.total} done. Messages already sent can't be recalled. The rest won't be contacted.`, confirm: "Stop sending", danger: true })) return;
    try { await api("/api/job/stop", { json: {} }); setJob(await api("/api/job")); } catch (e) { fail(e); }
  };

  const pct = job.total ? job.done / job.total : 0;
  const t = (now + offset.current) / 1000;
  const elapsed = job.started ? (job.finished || t) - job.started : 0;
  const left = Math.max(0, (job.total || 0) - job.done);
  const label = { whatsapp: "WhatsApp", email: "Email" };
  const title = { done: job.dry_run ? "Test run complete" : "Campaign sent", stopped: "Sending stopped", error: "Sending stopped with an error" }[job.phase] || (job.dry_run ? "Running a test" : "Sending your campaign");
  let status;
  if (job.phase === "sending" && job.current) status = <>Sending to <b>{job.current}</b>…</>;
  else if (job.phase === "waiting" && job.next_at) { const w = job.next_at - t; status = w >= 1 ? <>Next message in <b>{fmtDur(Math.ceil(w))}</b> · pausing between messages keeps your accounts safe</> : "Sending the next message…"; }
  else if (job.phase === "stopping") status = "Stopping after the current message…";
  else if (job.phase === "done") status = job.dry_run ? `Checked ${job.done} message${job.done === 1 ? "" : "s"}. Nothing was sent.` : `${job.sent} sent${job.failed ? `, ${job.failed} failed` : ""}${job.skipped ? `, ${job.skipped} not on WhatsApp` : ""}.`;
  else if (job.phase === "stopped") status = `Stopped after ${job.done} of ${job.total}. The rest weren't contacted.`;
  else if (job.phase === "error") status = job.current || "Something went wrong.";
  else status = (job.channels || []).includes("whatsapp") ? "Opening WhatsApp…" : "Getting ready…";
  const gmin = +data.settings.min_delay || 0, gmax = +data.settings.max_delay || 0;

  return (
    <AnimatePresence>
      {show && (
        <motion.div className={`sendview hud ${job.phase || ""}`} role="dialog" aria-modal="true" aria-label={title}
          initial={{ opacity: 0, scale: 1.03 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: .98 }} transition={{ duration: .35 }}>
          <div className="hud-grid" aria-hidden="true" /><div className="hud-scan" aria-hidden="true" />
          <header className="hud-top">
            <div className="hud-brand"><span className="hud-logo"><Icon name="logo" /></span><span>REACHOUT<small>OUTREACH CONTROL</small></span></div>
            <div className="hud-chips">
              <span className="hud-chip"><i className="led" /><span>{{ done: "MISSION COMPLETE", stopped: "LINK CLOSED", error: "FAULT", stopping: "ABORTING" }[job.phase] || "UPLINK ACTIVE"}</span></span>
              <span className="hud-chip">{(job.dry_run ? "Test run · " : "") + ((job.channels || []).map(c => label[c]).join(" + ") || "Preparing")}</span>
              <span className="hud-chip mono">{new Date(now).toLocaleTimeString([], { hour12: false })}</span>
            </div>
          </header>
          <main className="hud-body">
            <motion.section className="hud-panel hud-left" initial={{ x: -30, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: .15 }}>
              <h3 className="hud-h">Telemetry</h3>
              <div className="hud-stats">
                <div className="hud-stat ok"><span>Delivered</span><b>{job.sent || 0}</b></div>
                <div className={`hud-stat bad ${job.failed ? "hot" : ""}`}><span>Failed</span><b>{job.failed || 0}</b></div>
                {(job.channels || []).includes("whatsapp") && <div className={`hud-stat warn ${job.skipped ? "hot" : ""}`}><span>No WhatsApp</span><b>{job.skipped || 0}</b></div>}
                <div className="hud-stat"><span>Remaining</span><b>{left}</b></div>
              </div>
              <div className="hud-rows">
                <div><span>Elapsed</span><b className="mono">{fmtDur(elapsed)}</b></div>
                <div><span>Est. remaining</span><b className="mono">{!job.running ? "0:00" : job.done ? fmtDur((elapsed / job.done) * left) : "--:--"}</b></div>
                <div><span>Pace</span><b className="mono">{job.done && elapsed > 1 ? `${(job.done / (elapsed / 60)).toFixed(1)}/min` : "—"}</b></div>
                <div><span>Safety gap</span><b className="mono">{(job.channels || []).length ? `${gmin}–${Math.max(gmin, gmax)}s` : "—"}</b></div>
              </div>
              <h3 className="hud-h">Channel</h3>
              <div className="hud-eq" aria-hidden="true">{Array.from({ length: 12 }, (_, i) => <i key={i} />)}</div>
            </motion.section>
            <section className="hud-core" aria-live="polite">
              <motion.div className="reactor" initial={{ scale: .7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 160, damping: 16 }}>
                <svg viewBox="0 0 300 300" aria-hidden="true">
                  <defs>
                    <linearGradient id="svGrad" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor="var(--hud-a)" /><stop offset="1" stopColor="var(--hud-b)" /></linearGradient>
                    <filter id="svGlow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
                  </defs>
                  <g className="spin slow"><circle cx="150" cy="150" r="142" className="ring dash" /></g>
                  <g className="ticks">{ticks.map(([x1, y1, x2, y2], i) => <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} className={i < Math.round(pct * 60) ? "on" : ""} />)}</g>
                  <g className="spin rev"><path className="arc" d="M150 30 A120 120 0 0 1 270 150" /><path className="arc" d="M150 270 A120 120 0 0 1 30 150" /></g>
                  <circle cx="150" cy="150" r="104" className="ring track" />
                  <circle cx="150" cy="150" r="104" className="ring fg" filter="url(#svGlow)" style={{ strokeDashoffset: 653.5 * (1 - pct) }} />
                  <g className="spin fast"><circle cx="150" cy="150" r="84" className="ring dots" /></g>
                  <circle cx="150" cy="150" r="66" className="core-glow" />
                </svg>
                <div className="reactor-read"><b>{job.done}</b><span>of {job.total || "…"}</span><em className="mono">{Math.round(pct * 100)}%</em></div>
              </motion.div>
              <h2>{title}</h2>
              <p className="hud-status">{status}</p>
              <div className="hud-target"><span>TARGET</span><b>{job.phase === "sending" && job.current ? job.current : job.phase === "waiting" ? "Standing by" : job.running ? "Acquiring…" : "—"}</b></div>
            </section>
            <motion.section className="hud-panel hud-right" aria-label="Live log" initial={{ x: 30, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: .15 }}>
              <h3 className="hud-h">Transmission log <span className="hud-live"><i className="led" /><span>{job.running ? "LIVE" : "ENDED"}</span></span></h3>
              <ol className="log hud-log" ref={logRef}>
                {job.lines?.length ? logRows(job.lines).map(r => <li key={r.key} className={r.tone}><time>{r.time}</time><span>{r.text}</span></li>)
                  : <li className="idle">Getting ready…</li>}
              </ol>
            </motion.section>
          </main>
          <footer className="hud-foot">
            <div className="hud-progress" aria-hidden="true"><div style={{ width: `${pct * 100}%` }} /><div className="hud-segs">{Array.from({ length: Math.min(job.total || 0, 60) }, (_, i) => <i key={i} />)}</div></div>
            <div className="hud-foot-row">
              {job.running && <p className="hud-note"><Icon name="info" />Runs on the server: it keeps going if you switch pages. Don't quit the Reachout app until it's finished.</p>}
              {job.running ? (
                <div className="hud-actions">
                  <button className="hud-btn" onClick={toBackground} autoFocus><Icon name="columns" />Continue in background</button>
                  <button className="hud-btn danger" disabled={job.phase === "stopping"} onClick={stop}><Icon name="stop" />Stop sending</button>
                </div>
              ) : (
                <div className="hud-actions">
                  <button className="hud-btn" onClick={() => { close(); go("activity"); }}><Icon name="activity" />View activity</button>
                  <button className="hud-btn primary" onClick={close} autoFocus><Icon name="check" />Done</button>
                </div>
              )}
            </div>
          </footer>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
