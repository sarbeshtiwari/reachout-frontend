import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { go } from "../lib/router";
import { useApp } from "../lib/store";
import { Alert, Badge, Button, Check, Drawer, DrawerHead, Empty, Field, Icon, Switch, fail, modal, toast } from "../ui/kit";

const SOURCES = [
  ["career_sites", "Company career sites", "Greenhouse, Lever & Ashby job boards. No key needed.", null],
  ["tavily", "Tavily web search", "Search engine built for AI agents. Free key: 1,000 searches a month.", "https://app.tavily.com"],
  ["brave", "Brave web search", "Independent web search. Free key: 2,000 searches a month.", "https://api-dashboard.search.brave.com"],
];
const STEPS = ["Reading your resume", "Searching", "Ranking matches", "Done"];
const APPLY = { applied: ["Applied", "ok"], needs_you: ["Needs you", "warn"], closed: ["Closed", ""], ready: ["Ready", "brand"] };
const tone = s => (s >= 80 ? "great" : s >= 65 ? "good" : s >= 50 ? "fair" : "low");

export default function AIJobs() {
  const app = useApp();
  const [d, setD] = useState(null);
  const [f, setF] = useState({ role: "", years: "", company: "", location: "", resume: "" });
  const [sources, setSources] = useState(["career_sites"]);
  const [useLlm, setUseLlm] = useState(true);
  const [err, setErr] = useState({});
  const [busy, setBusy] = useState("");
  const [picked, setPicked] = useState(new Set());
  const [keysOpen, setKeysOpen] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);
  const [minScore, setMinScore] = useState(0);
  const timer = useRef(null);

  const load = async () => {
    try {
      const r = await api("/api/ai-jobs");
      setD(r);
      setF(x => ({ ...x, resume: x.resume || r.resumes.find(n => !/cover/i.test(n)) || r.resumes[0] || "",
                   ...(r.want && !x.role ? { role: r.want.role, years: String(r.want.years ?? ""), company: r.want.company || "", location: r.want.location || "" } : {}) }));
      clearTimeout(timer.current);
      if (r.state === "running" || r.applying?.state === "running") timer.current = setTimeout(load, 1800);
    } catch (e) { fail(e); }
  };
  useEffect(() => { load(); return () => clearTimeout(timer.current); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const set = k => e => setF(x => ({ ...x, [k]: e.target.value }));
  const running = d?.state === "running";
  const start = async () => {
    const e = {};
    if (!f.role.trim()) e.role = "Tell us the job you want.";
    if (f.years === "" || isNaN(+f.years) || +f.years < 0) e.years = "Enter your years of experience (0 is fine).";
    if (!f.resume) e.resume = "Upload your resume as a PDF on the Files page first.";
    setErr(e);
    if (Object.keys(e).length) return;
    setBusy("start");
    try {
      await api("/api/ai-jobs/match", { json: { ...f, years: Math.round(+f.years), sources, use_llm: useLlm } });
      setPicked(new Set()); load();
    } catch (x) { x.field && x.field !== "sources" ? setErr({ [x.field]: x.message }) : fail(x); if (x.field === "sources") setKeysOpen(true); }
    setBusy("");
  };
  const toggleSource = id => {
    if (id !== "career_sites" && !d?.keys?.[id] && !sources.includes(id)) { setKeysOpen(true); return; }
    setSources(s => s.includes(id) ? (s.length > 1 ? s.filter(x => x !== id) : s) : [...s, id]);
  };

  const results = (d?.results || []).filter(r => r.score >= minScore);
  const canPick = r => r.can_apply && r.apply?.state !== "applied" && r.apply?.state !== "closed";
  const toggle = id => setPicked(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const applyNow = async () => {
    if (!d.consent) { setApplyOpen(true); return; }
    const ids = [...picked];
    if (!await modal({ title: `Apply to ${ids.length} job${ids.length === 1 ? "" : "s"}?`, confirm: "Apply now",
      text: "Reachout AI fills each public application form with your resume and details and submits it. Forms with questions only you can answer, or a CAPTCHA, are handed back to you." })) return;
    setBusy("apply");
    try { await api("/api/ai-jobs/apply", { json: { ids } }); setPicked(new Set()); toast("Applying… you can leave this page."); load(); }
    catch (x) { x.field === "consent" || x.field === "phone" ? (x.field === "phone" ? (toast(x.message, true), go("profile")) : setApplyOpen(true)) : fail(x); }
    setBusy("");
  };

  const stage = STEPS.indexOf(d?.stage);
  return (
    <div className="ai-page">
      <div className="ai-hero card">
        <div className="ai-hero-glow" aria-hidden="true" />
        <div className="ai-hero-head">
          <span className="ai-chip"><Icon name="sparkles" />Reachout AI</span>
          <span className="help">{d?.local_model ? `Matching engine + ${d.model_name} running locally` : "Reachout's own matching engine · runs on our server, no outside AI"}</span>
        </div>
        <h2>What job are you looking for?</h2>
        <div className="ai-form">
          <Field label="Job you want" error={err.role} className="ai-wide">
            <input className="input" value={f.role} onChange={set("role")} placeholder="Full Stack Developer, AI Engineer, Data Analyst…" maxLength={80} onKeyDown={e => e.key === "Enter" && start()} />
          </Field>
          <Field label="Years of experience" error={err.years}>
            <input className="input" type="number" min="0" max="40" value={f.years} onChange={set("years")} placeholder="3" />
          </Field>
          <Field label="Company" opt="(optional)">
            <input className="input" value={f.company} onChange={set("company")} placeholder="Any company" maxLength={80} />
          </Field>
          <Field label="Location" opt="(optional)">
            <input className="input" value={f.location} onChange={set("location")} placeholder="Bengaluru, Remote…" maxLength={80} />
          </Field>
          <Field label="Resume" error={err.resume}>
            {d?.resumes?.length ? (
              <select className="select" value={f.resume} onChange={set("resume")}>{d.resumes.map(n => <option key={n} value={n}>{n}</option>)}</select>
            ) : <Button icon="upload" onClick={() => go("files")}>Upload a resume</Button>}
          </Field>
        </div>
        <div className="ai-sources">
          <span className="small-label">SEARCH WITH</span>
          {SOURCES.map(([id, label, hint]) => (
            <button key={id} type="button" className={`ai-source ${sources.includes(id) ? "on" : ""}`} onClick={() => toggleSource(id)} aria-pressed={sources.includes(id)}>
              <span className="ai-tick"><Icon name="check" /></span>
              <span><b>{label}</b><small>{id !== "career_sites" && !d?.keys?.[id] ? "Add your key to use" : hint}</small></span>
            </button>
          ))}
          <Button variant="ghost" size="sm" icon="settings" onClick={() => setKeysOpen(true)}>Search keys</Button>
        </div>
        <div className="ai-actions">
          {d?.local_model && <Switch checked={useLlm} onChange={setUseLlm}>Second opinion from {d.model_name}</Switch>}
          <span className="grow" />
          <Button variant="primary" size="lg" icon="sparkles" busy={busy === "start" || running} busyLabel={running ? d.stage + "…" : "Starting…"} onClick={start}>Find my matches</Button>
        </div>
      </div>

      <AnimatePresence>
        {running && (
          <motion.div className="card card-pad ai-steps" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {STEPS.slice(0, 3).map((s, i) => (
              <div key={s} className={`ai-step ${i < stage ? "done" : i === stage ? "now" : ""}`}>
                <span className="ai-step-dot">{i < stage ? <Icon name="check" /> : i + 1}</span>{s}
              </div>
            ))}
            {d.skills?.length > 0 && <p className="help">Skills found in your resume: {d.skills.slice(0, 12).join(", ")}</p>}
          </motion.div>
        )}
      </AnimatePresence>

      {d?.applying?.state === "running" && (
        <Alert tone="info" icon="sparkles">Applying… {d.applying.done} of {d.applying.total}{d.applying.current ? `: ${d.applying.current}` : ""}</Alert>
      )}

      {d?.state === "error" && <Alert tone="bad">{d.error}</Alert>}
      {d?.errors?.length > 0 && <Alert tone="warn">Some sources didn't answer: {d.errors.join(" · ")}</Alert>}

      {d?.state === "done" && (
        <div className="ai-results">
          <div className="toolbar">
            <div>
              <h3 className="sec-h" style={{ margin: 0 }}>{d.results.length ? `Top ${d.results.length} matches` : "No matches yet"} for {d.want?.role}</h3>
              <span className="help">{d.considered} openings checked · ranked by {d.engine}</span>
            </div>
            <span className="grow" />
            <select className="select auto" value={minScore} onChange={e => setMinScore(+e.target.value)} aria-label="Minimum match">
              <option value={0}>All matches</option><option value={50}>50%+ match</option><option value={65}>65%+ match</option><option value={80}>80%+ match</option>
            </select>
            <Button variant="primary" icon="send" busy={busy === "apply"} disabled={!picked.size || d.applying?.state === "running"} onClick={applyNow}>
              Auto-apply{picked.size ? ` (${picked.size})` : ""}
            </Button>
          </div>
          {!results.length ? (
            <Empty icon="sparkles" title="No jobs matched well enough">Try a broader job title, add web search, or lower the minimum match.</Empty>
          ) : (
            <div className="ai-grid">
              {results.map((r, i) => (
                <motion.article key={r.id} className={`ai-job card ${picked.has(r.id) ? "picked" : ""}`}
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 12) * .03 }}>
                  <div className="ai-job-top">
                    <div className={`ai-score ${tone(r.score)}`} style={{ "--p": r.score }} aria-label={`${r.score}% match`}><span>{r.score}<small>%</small></span></div>
                    <div className="ai-job-title">
                      <h4>{r.title}</h4>
                      <span className="help">{r.company}{r.location ? ` · ${r.location}` : ""}{r.posted ? ` · ${r.posted}` : ""}</span>
                    </div>
                    {canPick(r) && <Check checked={picked.has(r.id)} onChange={() => toggle(r.id)}><span className="sr-only">Select</span></Check>}
                  </div>
                  {r.ai_verdict && <p className="ai-verdict"><Icon name="sparkles" />{r.ai_verdict}</p>}
                  <ul className="ai-why">
                    {r.reasons.map(x => <li key={x} className="ok"><Icon name="check" />{x}</li>)}
                    {r.gaps.slice(0, 3).map(x => <li key={x} className="gap"><Icon name="alert" />{/^[A-Z]/.test(x) && !/ /.test(x) ? `Not on your resume: ${x}` : x}</li>)}
                  </ul>
                  <div className="ai-job-foot">
                    {r.apply ? <Badge tone={APPLY[r.apply.state]?.[1]} title={r.apply.detail}>{APPLY[r.apply.state]?.[0]}</Badge>
                      : r.can_apply ? <Badge tone="brand" dot={false}>Auto-apply ready</Badge> : <Badge dot={false}>Apply on site</Badge>}
                    {r.apply?.state === "needs_you" && <span className="help ai-detail">{r.apply.detail}</span>}
                    <span className="grow" />
                    <a className="btn btn-sm" href={r.apply?.url || r.url} target="_blank" rel="noopener noreferrer">{r.apply?.state === "needs_you" ? "Finish on site" : "View job"}<Icon name="link" /></a>
                  </div>
                </motion.article>
              ))}
            </div>
          )}
        </div>
      )}

      {d && d.state === "idle" && (
        <div className="ai-how">
          {[["file", "Reads your resume", "Finds your skills and experience in the PDF you choose."], ["search", "Searches for openings", "Company career sites, plus web search if you add a key."],
            ["sparkles", "Ranks every match", "Scores role, skills, experience and wording, and tells you why."], ["send", "Applies if you allow", "Fills public application forms on Greenhouse, Lever and Ashby for jobs you pick."]].map(([ic, t, s], i) => (
            <div key={t} className="card card-pad"><span className="ai-how-n">0{i + 1}</span><Icon name={ic} /><b>{t}</b><p className="help">{s}</p></div>
          ))}
        </div>
      )}

      <KeysDrawer open={keysOpen} onClose={() => setKeysOpen(false)} keys={d?.keys || {}} onSaved={k => { setD(x => ({ ...x, keys: k })); }} />
      <ApplyDrawer open={applyOpen} onClose={() => setApplyOpen(false)} d={d} me={app.data.profile} onSaved={r => setD(x => ({ ...x, details: r.details, consent: r.consent }))} />
    </div>
  );
}

function KeysDrawer({ open, onClose, keys, onSaved }) {
  const [v, setV] = useState({ tavily: "", brave: "" });
  const [busy, setBusy] = useState(false);
  const save = async (k, value) => {
    setBusy(true);
    try { onSaved(await api("/api/ai-jobs/keys", { method: "PUT", json: { [k]: value } })); setV(x => ({ ...x, [k]: "" })); toast(value ? "Key saved" : "Key removed"); }
    catch (e) { fail(e); }
    setBusy(false);
  };
  return (
    <Drawer open={open} onClose={onClose} label="Search keys">
      <DrawerHead title="Web search keys" sub="Optional. Career sites work without any key." onClose={onClose} />
      <div className="dr-pad ai-drawer">
        {SOURCES.slice(1).map(([id, label, hint, url]) => (
          <div key={id} className="ai-key">
            <b>{label}</b> {keys[id] && <Badge tone="ok">Saved</Badge>}
            <p className="help">{hint} <a className="link" href={url} target="_blank" rel="noopener noreferrer">Get a free key</a></p>
            <div className="ai-key-row">
              <input className="input" type="password" autoComplete="off" value={v[id]} placeholder={keys[id] ? "Replace the saved key" : "Paste your API key"} onChange={e => setV(x => ({ ...x, [id]: e.target.value }))} />
              <Button variant="primary" busy={busy} disabled={!v[id].trim()} onClick={() => save(id, v[id].trim())}>Save</Button>
              {keys[id] && <Button variant="ghost" onClick={() => save(id, "")}>Remove</Button>}
            </div>
          </div>
        ))}
        <Alert tone="info">Keys are stored encrypted and are only used for your own searches. They're never shown again or sent to your browser.</Alert>
      </div>
    </Drawer>
  );
}

function ApplyDrawer({ open, onClose, d, me, onSaved }) {
  const [v, setV] = useState({});
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setV(d?.details || {}); setOk(!!d?.consent); setErr({}); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = async consent => {
    setBusy(true);
    try { const r = await api("/api/ai-jobs/details", { method: "PUT", json: { ...v, consent } }); onSaved(r); toast(consent ? "Auto-apply is on. Pick jobs and press Auto-apply." : "Saved"); onClose(); }
    catch (e) { e.field ? setErr({ [e.field]: e.message }) : fail(e); }
    setBusy(false);
  };
  const F = [["linkedin", "LinkedIn", "https://linkedin.com/in/…"], ["github", "GitHub", "https://github.com/…"], ["portfolio", "Portfolio", "https://…"],
    ["current_company", "Current company", ""], ["location", "Current city", "Bengaluru"], ["notice", "Notice period", "30 days"]];
  return (
    <Drawer open={open} onClose={onClose} label="Auto-apply">
      <DrawerHead title="Auto-apply" sub="Reachout AI fills job applications with these details." onClose={onClose} />
      <div className="dr-pad ai-drawer">
        <p className="help">From your profile: <b>{me?.name || "add your name"}</b> · {me?.email || "your email"} · {me?.phone || <a className="link" href="/app/profile">add your phone</a>}</p>
        <div className="grid-2">
          {F.map(([k, label, ph]) => (
            <Field key={k} label={label} opt="(optional)" error={err[k]}>
              <input className="input" value={v[k] || ""} placeholder={ph} maxLength={200} onChange={e => setV(x => ({ ...x, [k]: e.target.value }))} />
            </Field>
          ))}
        </div>
        <Alert tone="warn" icon="shield">
          <b>How it works.</b> Only jobs you tick are applied to, at most {d?.apply_per_day || 20} a day, and only on public application forms
          (Greenhouse, Lever, Ashby). It never logs in to any site, never makes up answers, and stops at CAPTCHAs. Anything it can't
          finish is marked “Needs you” with a link. Each submitted application is added to your Applications page.
        </Alert>
        <Check checked={ok} onChange={setOk}>I allow Reachout AI to submit applications on my behalf for the jobs I select.</Check>
        <div className="form-actions">
          {d?.consent && <Button variant="ghost" onClick={() => save(false)}>Turn off auto-apply</Button>}
          <span className="grow" />
          <Button variant="primary" icon="check" busy={busy} disabled={!ok} onClick={() => save(true)}>Save and turn on</Button>
        </div>
      </div>
    </Drawer>
  );
}
