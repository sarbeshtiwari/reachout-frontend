import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { emit, on } from "../lib/bus";
import { ago, splitCsv, safeHref } from "../lib/format";
import { Alert, Button, Check, Empty, Field, Icon, Seg, applyError, fail, toast, useDebounced, Pager, usePager } from "../ui/kit";
import { MailSyncLine } from "../ui/shared";

const csv = a => (a || []).join(", ");

export default function Jobs() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState("matches");
  const [q, setQ] = useState("");
  const [prefsOpen, setPrefsOpen] = useState(false);
  const dq = useDebounced(q, 120);
  const load = useCallback(() => api("/api/jobs").then(r => { setD(r); setErr(""); }).catch(e => setErr(e.message)), []);
  useEffect(() => { load(); return on("sync-done", load); }, [load]);

  const vis = (j, t = tab) => {
    if (dq && ![j.title, j.company, j.location, j.source].some(v => (v || "").toLowerCase().includes(dq.toLowerCase()))) return false;
    if (t === "matches") return j.eligible && !["dismissed", "applied"].includes(j.state);
    if (t === "saved") return j.state === "saved";
    if (t === "applied") return j.state === "applied";
    return j.state !== "dismissed";
  };
  const jobs = d?.jobs || [];
  const rows = useMemo(() => jobs.filter(j => vis(j)), [jobs, tab, dq]); // eslint-disable-line react-hooks/exhaustive-deps
  const count = t => jobs.filter(j => vis(j, t)).length;
  const pg = usePager(rows, [tab, dq].join("|"), 20);
  const setState = async (id, state, quiet) => {
    const prev = jobs.find(x => x.id === id).state;
    setD(x => ({ ...x, jobs: x.jobs.map(j => j.id === id ? { ...j, state } : j) }));
    try { await api("/api/jobs/" + id, { method: "PUT", json: { state } }); if (!quiet) toast({ saved: "Saved", applied: "Marked as applied", dismissed: "Hidden", new: "Restored" }[state]); emit("apps-changed"); }
    catch (e) { setD(x => ({ ...x, jobs: x.jobs.map(j => j.id === id ? { ...j, state: prev } : j) })); fail(e); }
  };
  if (err) return <div className="card"><Empty icon="alert" title="Couldn't load jobs">{err}</Empty></div>;
  const p = d?.prefs;
  return (
    <div>
      <div className="card jobs-scan">
        <span className="ms-ic"><Icon name="zap" /></span>
        <div className="grow"><b>Job-alert emails</b><span className="help block">{d?.scanned_at ? `Last checked ${ago(d.scanned_at)} · ${jobs.length} job${jobs.length === 1 ? "" : "s"} collected` : "Read with each mail sync to collect jobs from your job-alert emails."}</span><MailSyncLine /></div>
        <Button icon="settings" className={prefsOpen ? "on" : ""} onClick={() => setPrefsOpen(o => !o)}>Matching preferences</Button>
      </div>
      <AnimatePresence>{prefsOpen && p && <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} style={{ overflow: "hidden" }}>
        <Prefs p={p} onSaved={r => { setD(x => ({ ...x, prefs: r })); load(); }} />
      </motion.div>}</AnimatePresence>
      <div className="toolbar">
        <Seg value={tab} onChange={setTab} options={[["matches", "Matches", "star", count("matches")], ["all", "All", null, count("all")], ["saved", "Saved", null, count("saved")], ["applied", "Applied", null, count("applied")]]} />
        <div className="search"><Icon name="search" /><input className="input" type="search" placeholder="Search jobs…" value={q} onChange={e => setQ(e.target.value)} /></div>
      </div>
      <Alert style={{ marginBottom: 14 }}>Auto-applying on LinkedIn or Naukri isn't allowed by those sites and gets accounts banned, so <b>Apply</b> opens the job for you and marks it Applied. For posts that ask for CVs by email, use <a href="/app/posts">Hiring posts</a>.</Alert>
      <div className="jobs-list">
        {!d && Array.from({ length: 4 }, (_, i) => <div key={i} className="card job sk-card" style={{ minHeight: 96 }} />)}
        <AnimatePresence initial={false}>
          {pg.items.map((j, i) => (
            <motion.article key={j.id} layout className={`card job ${j.state}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0, transition: { delay: Math.min(i, 10) * .03 } }} exit={{ opacity: 0, x: 40, transition: { duration: .2 } }}>
              <Ring s={j.score} />
              <div className="job-main">
                <h3>{j.title}</h3>
                <div className="job-meta">{j.company && <b>{j.company}</b>}{j.location && <span><Icon name="home" />{j.location}</span>}
                  {j.exp_min != null && <span><Icon name="clock" />{j.exp_min}{j.exp_max != null ? "–" + j.exp_max : "+"} yrs</span>}<span className="badge plain">{j.source}</span><span className="help">{ago(j.received)}</span></div>
                <div className="job-why">{j.reasons.map(r => <span key={r} className="chip-ok"><Icon name="check" />{r}</span>)}{j.flags.map(r => <span key={r} className="chip-warn">{r}</span>)}</div>
              </div>
              <div className="job-actions">
                {safeHref(j.url) && <a className="btn btn-primary btn-sm" href={safeHref(j.url)} target="_blank" rel="noopener noreferrer" onClick={() => { if (j.state !== "applied") { setState(j.id, "applied", true); toast("Opened the job. It's marked Applied (undo if you didn't apply)."); } }}><Icon name="external" />{j.state === "applied" ? "Open again" : "Apply"}</a>}
                {j.state === "applied" ? <><span className="badge ok">Applied</span><Button size="sm" variant="ghost" onClick={() => setState(j.id, "new")}>Undo</Button></>
                  : <><Button size="sm" icon="star" className={j.state === "saved" ? "on" : ""} onClick={() => setState(j.id, j.state === "saved" ? "new" : "saved")}>{j.state === "saved" ? "Saved" : "Save"}</Button>
                    <Button size="sm" variant="ghost" icon="x" title="Hide this job" aria-label="Hide" onClick={() => setState(j.id, "dismissed")} /></>}
              </div>
            </motion.article>))}
        </AnimatePresence>
        {d && !rows.length && <div className="card">{jobs.length ? <Empty icon="search" title={tab === "matches" ? "No matches right now" : "Nothing here"}>{tab === "matches" ? "None of the collected jobs reach your match score. Try lowering it in Matching preferences, or check All." : ""}</Empty>
          : <Empty icon="zap" title="No jobs yet" action={<a className="btn btn-sm" href="/app/profile">Mail sync settings</a>}>Turn on job alerts on Naukri, LinkedIn or Indeed; new ones arrive with each mail sync.</Empty>}</div>}
      </div>
      {rows.length > 0 && <div className="card" style={{ marginTop: 12 }}><Pager p={pg} label="jobs" sizes={[10, 20, 50]} /></div>}
    </div>
  );
}

function Ring({ s }) {
  const tone = s >= 70 ? "hi" : s >= 55 ? "mid" : "lo";
  const c = 2 * Math.PI * 22;
  return (
    <div className={`score ${tone}`} title="Match score">
      <svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="22" className="bg" /><motion.circle cx="26" cy="26" r="22" className="fg" strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - s / 100) }} transition={{ duration: .9, ease: [.2, .8, .2, 1] }} /></svg>
      <b>{s}</b>
    </div>
  );
}

function Prefs({ p, onSaved }) {
  const [v, setV] = useState({ roles: csv(p.roles), years: p.years ?? "", skills: csv(p.skills), locations: csv(p.locations), remote_ok: p.remote_ok !== false, exclude: csv(p.exclude), min_score: p.min_score ?? 55, auto_scan: p.auto_scan !== false });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState("");
  const set = k => e => { setV(x => ({ ...x, [k]: e.target.value })); setErrors(x => ({ ...x, [k]: "" })); };
  const save = async e => {
    e.preventDefault();
    const data = { roles: splitCsv(v.roles), skills: splitCsv(v.skills), locations: splitCsv(v.locations), exclude: splitCsv(v.exclude), years: String(v.years).trim(), min_score: +v.min_score, remote_ok: v.remote_ok, auto_scan: v.auto_scan };
    if (!data.roles.length) return setErrors({ roles: "Add at least one role, e.g. Full Stack Developer." });
    if (data.years === "" || isNaN(+data.years) || +data.years < 0 || +data.years > 40) return setErrors({ years: "Enter your years of experience, e.g. 2." });
    if (!(data.min_score >= 20 && data.min_score <= 95)) return setErrors({ min_score: "Pick a number from 20 to 95." });
    setBusy("save");
    try { onSaved(await api("/api/jobs/prefs", { method: "PUT", json: data })); toast("Preferences saved. Scores updated."); } catch (er) { applyError(er, setErrors); }
    setBusy("");
  };
  const reset = async () => { setBusy("reset"); try { onSaved(await api("/api/jobs/prefs/reset", { json: {} })); toast("Preferences refilled from your resume."); } catch (e) { fail(e); } setBusy(""); };
  return (
    <form className="card card-pad jobs-prefs" onSubmit={save} noValidate>
      <div className="row-2">
        <Field label="Roles you want" opt="(comma separated)" error={errors.roles}><input className="input" value={v.roles} onChange={set("roles")} /></Field>
        <Field label="Years of experience" error={errors.years}><input className="input" inputMode="decimal" value={v.years} onChange={set("years")} /></Field>
        <Field label="Your skills"><textarea className="textarea" rows={3} style={{ minHeight: 74 }} value={v.skills} onChange={set("skills")} /></Field>
        <div className="field"><Field label="Preferred locations" opt="(empty = anywhere)"><input className="input" value={v.locations} placeholder="Noida, Gurugram, Delhi" onChange={set("locations")} /></Field>
          <Check checked={v.remote_ok} onChange={x => setV(y => ({ ...y, remote_ok: x }))}>Remote jobs count as a match</Check></div>
        <Field label="Hide jobs with these words in the title"><input className="input" value={v.exclude} onChange={set("exclude")} /></Field>
        <div className="field"><Field label="Show as a match from score" error={errors.min_score}><input className="input" type="number" min={20} max={95} value={v.min_score} onChange={set("min_score")} /></Field>
          <Check checked={v.auto_scan} onChange={x => setV(y => ({ ...y, auto_scan: x }))}>Check my inbox for new job alerts every hour</Check></div>
      </div>
      <div className="form-actions"><Button variant="ghost" busy={busy === "reset"} onClick={reset}>Reset from my resume</Button><span className="grow" /><Button type="submit" variant="primary" busy={busy === "save"} busyLabel="Saving…">Save preferences</Button></div>
    </form>
  );
}
