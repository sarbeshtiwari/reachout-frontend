import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { go } from "../lib/router";
import { useApp } from "../lib/store";
import { Alert, Badge, Button, Check, Drawer, DrawerHead, Empty, Field, Icon, Switch, fail, modal, toast } from "../ui/kit";

const SOURCES = [
  ["career_sites", "Company career sites", "Greenhouse, Lever & Ashby job boards. No key needed.", null],
  ["tavily", "Tavily web search", "Search built for AI agents. Free: 1,000 searches a month, no card needed.", "https://app.tavily.com"],
  ["brave", "Brave web search", "Independent web search. $5 free credit a month (about 1,000 searches); needs a card.", "https://api-dashboard.search.brave.com"],
];
const STEPS = ["Reading your resume", "Searching", "Ranking matches", "Done"];
const APPLY = { applied: ["Applied", "ok"], needs_you: ["Needs you", "warn"], closed: ["Closed", ""], ready: ["Ready", "brand"], with_you: ["Open on your screen", "brand"], blocked: ["Apply in your browser", "warn"] };
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
  const [watchWindow, setWatchWindow] = useState(true);
  const [kitFor, setKitFor] = useState(null);
  const [answersOpen, setAnswersOpen] = useState(null); // null = closed; {} = open; {question, company} = open with a new answer
  const [answers, setAnswers] = useState([]);
  const loadAnswers = () => api("/api/ai-jobs/answers").then(r => setAnswers(r.answers)).catch(() => {});
  useEffect(() => { loadAnswers(); }, []);
  const toReview = answers.filter(a => a.status === "review").length;
  const timer = useRef(null);

  const load = async () => {
    try {
      const r = await api("/api/ai-jobs");
      setD(r);
      setF(x => ({ ...x, resume: x.resume || r.resumes.find(n => !/cover/i.test(n)) || r.resumes[0] || "",
                   ...(r.want && !x.role ? { role: r.want.role, years: String(r.want.years ?? ""), company: r.want.company || "", location: r.want.location || "" } : {}) }));
      clearTimeout(timer.current);
      if (r.state === "running" || r.applying?.state === "running" || r.handover) timer.current = setTimeout(load, 1800);
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
      text: watchWindow && d.can_hand_over
        ? "A browser window opens and each job gets its own tab: Reachout AI fills the form and submits it. Where you're needed (signing in, creating an account, a question only you can answer, a CAPTCHA) it pauses with a bar at the bottom of the page; do that part, then press Continue."
        : "Reachout AI fills each public application form with your resume and details and submits it. Forms with questions only you can answer, or a CAPTCHA, are handed back to you. You can watch it live on this page." })) return;
    setBusy("apply");
    try { await api("/api/ai-jobs/apply", { json: { ids, watch: watchWindow } }); setPicked(new Set()); toast("Applying… watch it live below."); load(); }
    catch (x) { x.field === "consent" || x.field === "phone" ? (x.field === "phone" ? (toast(x.message, true), go("profile")) : setApplyOpen(true)) : fail(x); }
    setBusy("");
  };

  const finish = async r => {
    setBusy("finish:" + r.id);
    try { await api(`/api/ai-jobs/finish/${encodeURIComponent(r.id)}`, { json: {} }); toast("Opening a browser window… answer what it asks, then press Continue in the page."); load(); }
    catch (x) { x.field === "consent" ? setApplyOpen(true) : fail(x); }
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
          <Button variant="ghost" size="sm" icon="note" onClick={() => { loadAnswers(); setAnswersOpen({}); }}>
            My answers{answers.length ? ` (${answers.length})` : ""}{toReview > 0 && <span className="ai-review-dot">{toReview} to review</span>}
          </Button>
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

      <LiveView active={d?.applying?.state === "running" || !!d?.handover} />

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
            {d.can_hand_over && <Check checked={watchWindow} onChange={setWatchWindow}>Watch it in a browser window</Check>}
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
                    {["needs_you", "with_you", "blocked"].includes(r.apply?.state) && <span className="help ai-detail">{r.apply.detail}</span>}
                    {r.apply?.questions?.length > 0 && r.apply.state !== "applied" && (
                      <details className="ai-questions"><summary>{r.apply.questions.length} question{r.apply.questions.length === 1 ? "" : "s"} for you</summary>
                        <ul>{r.apply.questions.map(q => <li key={q}>{q} <button type="button" className="link ai-save-q"
                          onClick={() => setAnswersOpen({ question: q.replace(/ \(choose from the list\)$/, ""), company: /why|interest|excite/i.test(q) ? r.company : "" })}>Save an answer</button></li>)}</ul></details>)}
                    <span className="grow" />
                    {["needs_you", "blocked"].includes(r.apply?.state) && (
                      <Button size="sm" icon="copy" variant={r.apply.state === "blocked" ? "primary" : ""} onClick={() => setKitFor(r)}>Apply in my browser</Button>)}
                    {r.can_apply && d.can_hand_over && ["needs_you", "ready", undefined].includes(r.apply?.state) && (
                      <Button size="sm" variant="primary" icon="sparkles" busy={busy === "finish:" + r.id} disabled={!!d.handover}
                        title="Opens the form in a browser window on this computer, fills it, and waits for you to answer the rest; press Continue in the page and it submits" onClick={() => finish(r)}>Fill &amp; finish</Button>)}
                    <a className="btn btn-sm" href={r.apply?.url || r.url} target="_blank" rel="noopener noreferrer"
                      title={r.apply?.state === "needs_you" && !d.can_hand_over ? "Opens a fresh copy of the form; answers filled on the server don't carry over" : undefined}>
                      {r.apply?.state === "needs_you" ? (d.can_hand_over ? "Open blank form" : "Open the form") : "View job"}<Icon name="link" /></a>
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

      <KitDrawer job={kitFor} onClose={() => setKitFor(null)} onAnswers={q => { setKitFor(null); setAnswersOpen(q); }} />
      <AnswersDrawer open={answersOpen} onClose={() => setAnswersOpen(null)} answers={answers} reload={loadAnswers} />
      <KeysDrawer open={keysOpen} onClose={() => setKeysOpen(false)} keys={d?.keys || {}} onSaved={k => { setD(x => ({ ...x, keys: k })); }} />
      <ApplyDrawer open={applyOpen} onClose={() => setApplyOpen(false)} d={d} me={app.data.profile} onSaved={r => setD(x => ({ ...x, details: r.details, consent: r.consent }))} />
    </div>
  );
}

function LiveView({ active }) {
  const [v, setV] = useState(null);
  useEffect(() => {
    let stop = false, t;
    const tick = async () => {
      try { const r = await api("/api/ai-jobs/live"); if (!stop) setV(r.active ? r : null); } catch { /* keep the last frame */ }
      if (!stop) t = setTimeout(tick, active ? 900 : 4000);
    };
    tick();
    return () => { stop = true; clearTimeout(t); };
  }, [active]);
  if (!v?.active && !active) return null;
  if (!v?.job) return null;
  return (
    <div className="card ai-live">
      <div className="ai-live-head"><span className="ai-live-dot" />Live: {v.job}</div>
      <div className="ai-live-body">
        <div className="ai-live-screen">{v.frame ? <img src={v.frame} alt="What the application browser shows right now" /> : <div className="help">Starting the browser…</div>}</div>
        <ol className="ai-live-log">{v.log.map((l, i) => <li key={i} className={i === v.log.length - 1 ? "now" : ""}>{l}</li>)}</ol>
      </div>
    </div>
  );
}

const KEY_STEPS = {
  tavily: [
    <>Open <a className="link" href="https://app.tavily.com" target="_blank" rel="noopener noreferrer">app.tavily.com</a> and sign up (Google, GitHub or email). No credit card is needed.</>,
    <>Your dashboard opens with an API key already made. It starts with <code>tvly-</code>.</>,
    <>Click the copy icon next to the key, paste it below and press <b>Save</b>.</>,
    <>The free plan gives 1,000 searches a month; one Reachout search uses one or two.</>,
  ],
  brave: [
    <>Open <a className="link" href="https://api-dashboard.search.brave.com" target="_blank" rel="noopener noreferrer">api-dashboard.search.brave.com</a> and create an account, then confirm your email.</>,
    <>Go to <b>Subscriptions</b> and pick the <b>Search</b> plan. Brave asks for a credit card and adds $5 of free credit every month (about 1,000 searches).</>,
    <>To avoid charges, set a monthly limit in the dashboard if it offers one, and keep an eye on usage. Brave's terms ask for a “Powered by Brave” mention to keep the free credit.</>,
    <>Go to <b>API Keys</b>, click <b>Add API key</b>, name it “Reachout”, copy it, paste it below and press <b>Save</b>.</>,
  ],
};

function KitDrawer({ job, onClose, onAnswers }) {
  const [k, setK] = useState(null);
  useEffect(() => { setK(null); if (job) api(`/api/ai-jobs/kit/${encodeURIComponent(job.id)}`).then(setK).catch(e => { fail(e); onClose(); }); }, [job]); // eslint-disable-line react-hooks/exhaustive-deps
  const copy = async (text, what) => { try { await navigator.clipboard.writeText(text); toast(`${what} copied`); } catch { toast("Couldn't copy. Select the text and copy it.", true); } };
  return (
    <Drawer open={!!job} onClose={onClose} label="Apply in my browser" wide>
      <DrawerHead title="Apply in my browser" sub={job ? `${job.title} · ${job.company}` : ""} onClose={onClose} />
      <div className="dr-pad ai-drawer">
        {!k ? <p className="help">Loading…</p> : <>
          <Alert tone="info" icon="shield">Some sites only accept applications from a person's own browser. Open the form in your browser, attach your resume
            ({k.resume || "from Files"}), and copy each answer from here.</Alert>
          <div className="form-actions" style={{ justifyContent: "flex-start" }}>
            <a className="btn btn-primary" href={k.apply_url} target="_blank" rel="noopener noreferrer"><Icon name="link" />Open the application form</a>
            <a className="btn" href="/app/files" target="_blank" rel="noopener noreferrer"><Icon name="file" />Download resume</a>
          </div>
          <div className="ai-kit">
            {k.fields.map(f => (
              <div key={f.label} className="ai-kit-row"><span className="help">{f.label}</span><b>{f.value}</b>
                <Button size="sm" variant="ghost" icon="copy" onClick={() => copy(f.value, f.label)}>Copy</Button></div>
            ))}
          </div>
          {k.answers.length > 0 && <h4 className="sec-h" style={{ margin: "6px 0 0" }}>Questions on this form</h4>}
          {k.answers.map(a => (
            <div key={a.question} className={`ai-answer ${a.draft ? "review" : ""}`}>
              <div className="ai-answer-head"><b>{a.question}</b>{a.draft && <Badge tone="warn">Draft: check it first</Badge>}</div>
              {a.answer ? <>
                <p className="ai-kit-answer">{a.answer}</p>
                <div className="ai-answer-foot"><span className="grow" /><Button size="sm" icon="copy" onClick={() => copy(a.answer, "Answer")}>Copy answer</Button></div>
              </> : <div className="ai-answer-foot"><span className="help">No saved answer yet.</span><span className="grow" />
                <Button size="sm" variant="ghost" icon="note" onClick={() => onAnswers({ question: a.question, company: /why|interest|excite/i.test(a.question) ? job.company : "" })}>Write an answer</Button></div>}
            </div>
          ))}
        </>}
      </div>
    </Drawer>
  );
}

function AnswersDrawer({ open, onClose, answers, reload }) {
  const [tab, setTab] = useState("all");
  const [draft, setDraft] = useState({ question: "", answer: "", company: "" });
  const [edits, setEdits] = useState({});
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState({});
  useEffect(() => { if (open) { setDraft({ question: open.question || "", answer: "", company: open.company || "" }); setErr({}); setEdits({}); if (open.question) setTab("all"); } }, [open]);
  const add = async () => {
    setBusy("add");
    try { await api("/api/ai-jobs/answers", { json: draft }); setDraft({ question: "", answer: "", company: "" }); toast("Answer saved. Reachout AI will use it on matching questions."); reload(); }
    catch (e) { e.field ? setErr({ [e.field]: e.message }) : fail(e); }
    setBusy("");
  };
  const save = async (a, approve) => {
    setBusy(a.id);
    try { await api(`/api/ai-jobs/answers/${a.id}`, { method: "PUT", json: { ...a, ...(edits[a.id] || {}), approve } }); setEdits(x => ({ ...x, [a.id]: undefined })); reload(); }
    catch (e) { fail(e); }
    setBusy("");
  };
  const del = async a => { await api(`/api/ai-jobs/answers/${a.id}`, { method: "DELETE" }).catch(fail); reload(); };
  const approveAll = async () => { const r = await api("/api/ai-jobs/answers/approve-all", { json: {} }).catch(fail); r && toast(`${r.approved} approved`); reload(); };
  const review = answers.filter(a => a.status === "review");
  const shown = tab === "review" ? review : answers;
  const ed = (a, k) => (edits[a.id] || {})[k] ?? a[k] ?? "";
  const setEd = (a, k, v) => setEdits(x => ({ ...x, [a.id]: { ...(x[a.id] || {}), [k]: v } }));
  return (
    <Drawer open={!!open} onClose={onClose} label="My answers" wide>
      <DrawerHead title="My answers" sub="Answers Reachout AI uses on application forms. It learns from forms you fill in; you approve what it keeps." onClose={onClose} />
      <div className="dr-pad ai-drawer">
        <div className="ai-answer-new card card-pad">
          <b>Add an answer</b>
          <Field label="Question" error={err.question}><input className="input" value={draft.question} maxLength={300} placeholder="Will you require visa sponsorship?" onChange={e => setDraft(x => ({ ...x, question: e.target.value }))} /></Field>
          <Field label="Your answer" error={err.answer} hint="For dropdowns and Yes/No questions, write the option exactly as the form shows it (e.g. Yes, No, LinkedIn).">
            <textarea className="input" rows={4} value={draft.answer} maxLength={4000} onChange={e => setDraft(x => ({ ...x, answer: e.target.value }))} /></Field>
          <Field label="Only for company" opt="(optional)" hint="Set it for answers like “Why do you want to work here?”, so they never go to another company. You can write {company} in a general answer.">
            <input className="input" value={draft.company} maxLength={80} placeholder="Notion" onChange={e => setDraft(x => ({ ...x, company: e.target.value }))} /></Field>
          <div className="form-actions"><span className="grow" /><Button variant="primary" icon="check" busy={busy === "add"} disabled={!draft.question.trim() || !draft.answer.trim()} onClick={add}>Save answer</Button></div>
        </div>
        <div className="toolbar" style={{ margin: 0 }}>
          <Seg value={tab} onChange={setTab} name="Which answers" size="sm" options={[["all", "All", null, answers.length || undefined], ["review", "To review", null, review.length || undefined]]} />
          <span className="grow" />
          {review.length > 0 && <Button size="sm" icon="check" onClick={approveAll}>Approve all</Button>}
        </div>
        {!shown.length && <Empty icon="note" title={tab === "review" ? "Nothing to review" : "No saved answers yet"}>
          {tab === "review" ? "Answers you type in application forms appear here for you to approve." : "Add one above, or apply with “Watch it in a browser window”: what you answer there is saved here for your review."}</Empty>}
        {shown.map(a => (
          <div key={a.id} className={`ai-answer ${a.status}`}>
            <div className="ai-answer-head">
              {a.status === "review" ? <Badge tone="warn">To review</Badge> : <Badge tone="ok">Used in forms</Badge>}
              {a.company && <Badge dot={false}>Only {a.company}</Badge>}
              <span className="help">{a.source === "learned" ? `Learned from ${a.learned_from}` : a.source === "draft" ? "Draft by Reachout AI: check it's true for you" : "Added by you"}</span>
            </div>
            <input className="input ai-answer-q" value={ed(a, "question")} onChange={e => setEd(a, "question", e.target.value)} aria-label="Question" />
            <textarea className="input" rows={Math.min(8, Math.max(2, Math.ceil(ed(a, "answer").length / 80)))} value={ed(a, "answer")} onChange={e => setEd(a, "answer", e.target.value)} aria-label="Answer" />
            <div className="ai-answer-foot">
              <input className="input ai-answer-co" value={ed(a, "company")} placeholder="Any company" onChange={e => setEd(a, "company", e.target.value)} aria-label="Only for company" />
              <span className="grow" />
              <Button size="sm" variant="ghost" icon="trash" onClick={() => del(a)}>Delete</Button>
              {edits[a.id] && a.status === "approved" && <Button size="sm" busy={busy === a.id} onClick={() => save(a, true)}>Save</Button>}
              {a.status === "review" && <Button size="sm" variant="primary" icon="check" busy={busy === a.id} onClick={() => save(a, true)}>Approve</Button>}
            </div>
          </div>
        ))}
      </div>
    </Drawer>
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
            <p className="help">{hint}</p>
            <details className="ai-steps-howto" open={!keys[id]}>
              <summary>How to get a {label.split(" ")[0]} key</summary>
              <ol>{KEY_STEPS[id].map((step, i) => <li key={i}>{step}</li>)}</ol>
              <a className="btn btn-sm" href={url} target="_blank" rel="noopener noreferrer">Open {label.split(" ")[0]}<Icon name="link" /></a>
            </details>
            <div className="ai-key-row">
              <input className="input" type="password" autoComplete="off" value={v[id]} placeholder={keys[id] ? "Replace the saved key" : "Paste your API key"} onChange={e => setV(x => ({ ...x, [id]: e.target.value }))} />
              <Button variant="primary" busy={busy} disabled={!v[id].trim()} onClick={() => save(id, v[id].trim())}>Save</Button>
              {keys[id] && <Button variant="ghost" onClick={() => save(id, "")}>Remove</Button>}
            </div>
          </div>
        ))}
        <Alert tone="info">You don't need either key: <b>Company career sites</b> works without one. Keys are stored encrypted, used only for your own searches, and never shown again or sent to your browser.</Alert>
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
