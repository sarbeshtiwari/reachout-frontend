import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import { EMAIL_RE, bracesOk, initials, kb } from "../lib/format";
import { useApp } from "../lib/store";
import { Alert, Button, Field, FileIcon, FormError, Icon, Switch, fail, modal, spring, toast } from "../ui/kit";
import { FieldChips, insertAt } from "../ui/shared";

const CORE = ["name", "company", "phone", "email"];
const STATUS = ["wa_status", "wa_last", "email_status", "email_last", "email_opened", "replied_at", "reply_intent", "reply_count", "added_at"];
const CRM = ["stage", "follow_up"];
export const extraCols = rows => [...new Set(rows.flatMap(r => Object.keys(r)).filter(k => !CORE.includes(k) && !STATUS.includes(k) && !CRM.includes(k) && k !== "id"))];

const STEPS = [["channel", "Channel"], ["audience", "Audience"], ["message", "Message"], ["files", "Attachments"], ["review", "Review & send"]];
const CHANNELS = [
  ["email", "Email", "mail", "From your own Gmail, with a subject line and attachments"],
  ["whatsapp", "WhatsApp", "phone", "From your linked WhatsApp. Keep batches small"],
  ["both", "Both", "zap", "Email and WhatsApp to everyone who has both"],
];

export default function Campaign() {
  const app = useApp();
  const { data, me, wa, job, selected } = app;
  const st = data.settings;
  const preset = app.campaignPreset;
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const waOn = me?.whatsapp !== false;
  const channels = waOn ? CHANNELS : CHANNELS.filter(c => c[0] === "email");
  const [mode, setMode] = useState(waOn ? st.mode || "email" : "email");
  const [who, setWho] = useState(preset?.who || "all");
  const [resend, setResend] = useState(!!preset?.resend);
  const [tplId, setTplId] = useState(st.template_id && data.templates.find(t => t.id === st.template_id) ? st.template_id : data.templates[0]?.id || "");
  const tpl = data.templates.find(t => t.id === tplId);
  const [subject, setSubject] = useState(tpl?.subject || "");
  const [body, setBody] = useState(tpl?.body || "");
  const [docs, setDocs] = useState(() => new Set(st.documents ?? data.documents.map(d => d.name)));
  const [limit, setLimit] = useState(st.limit ?? 20);
  const [minD, setMinD] = useState(st.min_delay ?? 30);
  const [maxD, setMaxD] = useState(st.max_delay ?? 90);
  const [dry, setDry] = useState(false);
  const [track, setTrack] = useState(false);
  const [errors, setErrors] = useState({});
  const [sendError, setSendError] = useState("");
  const [starting, setStarting] = useState(false);
  const [pv, setPv] = useState(null);
  const [pvIndex, setPvIndex] = useState(0);
  const bodyRef = useRef(null);

  useEffect(() => { if (preset) { app.setCampaignPreset(null); if (preset.who === "selected") setStep(2); } }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const pickTemplate = id => { setTplId(id); const t = data.templates.find(x => x.id === id); setSubject(t?.subject || ""); setBody(t?.body || ""); };

  const eligible = r => {
    const w = !!(r.phone || "").trim() && (resend || !["sent", "not_on_whatsapp"].includes(r.wa_status));
    const e = EMAIL_RE.test((r.email || "").trim()) && !["bounced", "invalid"].includes(r.email_status) && (resend || r.email_status !== "sent") && (who === "selected" || !r.replied_at);
    return mode === "whatsapp" ? w : mode === "email" ? e : w || e;
  };
  const pool = who === "selected" ? data.recipients.filter(r => selected.has(r.id)) : data.recipients;
  const audience = useMemo(() => pool.filter(eligible), [pool, mode, resend, who]); // eslint-disable-line react-hooks/exhaustive-deps
  const lim = Math.max(1, Math.min(500, parseInt(limit) || 20));
  const going = Math.min(audience.length, lim);
  const sample = audience.length ? audience[pvIndex % audience.length] : data.recipients[0];
  const fields = [...CORE, ...extraCols(data.recipients), "sender_name", "sender_phone", "sender_email"];
  const channelOk = { email: !!data.profile.has_password, whatsapp: wa.state === "connected" };
  channelOk.both = channelOk.email && channelOk.whatsapp;
  const gap = Math.max((Number(minD) + Number(maxD)) / 2, mode !== "email" ? me.min_wa_delay : 0);
  const eta = going ? Math.max(1, Math.round((going * gap) / 60)) : 0;

  useEffect(() => {
    const t = setTimeout(async () => { try { setPv(await api("/api/preview", { json: { subject, body, recipient_id: sample?.id } })); } catch { /* best effort */ } }, 260);
    return () => clearTimeout(t);
  }, [subject, body, sample?.id]);

  // What stops you moving on from each step.
  const check = i => {
    const e = {};
    if (i === 0 && !dry && !channelOk[mode]) e.mode = mode === "whatsapp" ? "Link WhatsApp first, or turn on Test run in the last step." : mode === "email" ? "Connect Gmail on the Profile page first, or turn on Test run in the last step." : "Both WhatsApp and Gmail need to be connected.";
    if (i === 1) { if (who === "selected" && !selected.size) e.who = "Select contacts on the Contacts page first."; else if (!audience.length) e.who = "Nobody to send to with these settings."; }
    if (i === 2) {
      if (mode !== "whatsapp" && !subject.trim()) e.subject = "Email subject is required.";
      else if (mode !== "whatsapp" && !bracesOk(subject)) e.subject = "There's an unmatched { or }.";
      if (!body.trim()) e.body = "Write a message to send."; else if (!bracesOk(body)) e.body = "There's an unmatched { or }. Fields look like {name}.";
    }
    if (i === 4) {
      const l = Number(limit), mn = Number(minD), mx = Number(maxD);
      if (!Number.isInteger(l) || l < 1 || l > 500) e.limit = "Enter a number from 1 to 500.";
      if (!Number.isInteger(mn) || mn < 0 || mn > 3600) e.min_delay = "0–3600 seconds.";
      if (!Number.isInteger(mx) || mx < 0 || mx > 3600) e.max_delay = "0–3600 seconds."; else if (mx < mn) e.max_delay = "At least the min gap.";
    }
    return e;
  };
  const ok = i => !Object.keys(check(i)).length;
  const goTo = i => {
    for (let k = step; k < i; k++) { const e = check(k); if (Object.keys(e).length && k !== 0) { setErrors(e); setDir(1); setStep(k); return; } }
    setErrors({}); setDir(i > step ? 1 : -1); setStep(i);
  };
  const start = async () => {
    setSendError("");
    for (let k = 0; k < 5; k++) { const e = check(k); if (Object.keys(e).length) { setErrors(e); setDir(k > step ? 1 : -1); setStep(k); return; } }
    if (!dry && /<[a-z][^<>]{3,}>/i.test(body) && !await modal({ title: "Your message still has placeholders", text: "It still contains text in <angle brackets> that you should replace. Send anyway?", confirm: "Send anyway" })) return;
    const cfg = { mode, who, recipient_ids: [...selected], template_id: tplId, subject, body, documents: [...docs], resend, dry_run: dry,
      track_opens: track && mode !== "whatsapp", limit: Number(limit), min_delay: Number(minD), max_delay: Number(maxD) };
    if (!dry && !await modal({ title: `Send to ${going} ${going === 1 ? "person" : "people"}?`, text: `Via ${{ whatsapp: "WhatsApp", email: "email", both: "WhatsApp and email" }[mode]} with ${docs.size ? `${docs.size} attachment(s)` : "no attachments"}. You can stop at any time.`, confirm: "Start sending" })) return;
    setStarting(true);
    try {
      await api("/api/send", { json: cfg });
      app.setData(d => ({ ...d, settings: { ...d.settings, ...cfg } }));
      app.setJob({ running: true, lines: [], done: 0, total: 0, phase: "starting", dry_run: dry, channels: [] });
      dispatchEvent(new Event("open-sendview"));
      app.pollJob();
    } catch (err) { setSendError(err.message); }
    setStarting(false);
  };
  const saveAsTpl = async () => {
    if (!body.trim()) return setErrors({ body: "Write a message first." });
    const name = await modal({ title: "Save as template", text: "Give this message a name so you can reuse it.", input: "", confirm: "Save" });
    if (name === null) return;
    if (!name.trim()) return toast("Template name is required.", true);
    try { const t = await api("/api/templates", { json: { name: name.trim(), subject, body } }); app.setData(d => ({ ...d, templates: [...d.templates, t] })); setTplId(t.id); toast("Template saved"); }
    catch (err) { fail(err); }
  };

  if (job.running) return (
    <motion.div className="card cp-running" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <div className="cp-run-ring"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" className="bg" /><motion.circle cx="60" cy="60" r="52" className="fg" strokeDasharray={327} animate={{ strokeDashoffset: 327 * (1 - (job.total ? job.done / job.total : 0)) }} /></svg><b>{job.done}<span>/{job.total || "…"}</span></b></div>
      <h3>{job.dry_run ? "Test run in progress" : "Your campaign is sending"}</h3>
      <p className="help">It runs on the server, so you can keep using Reachout. Open the live view to watch or stop it.</p>
      <Button variant="primary" size="lg" icon="activity" onClick={() => dispatchEvent(new Event("open-sendview"))}>Open live view</Button>
    </motion.div>
  );

  const summaries = [
    { email: "Email", whatsapp: "WhatsApp", both: "Email + WhatsApp" }[mode],
    `${going} ${going === 1 ? "person" : "people"}`,
    mode === "whatsapp" ? `${body.length} characters` : (subject || "No subject yet"),
    docs.size ? `${docs.size} file${docs.size === 1 ? "" : "s"}` : "No files",
    dry ? "Test run" : "Not sent yet",
  ];
  return (
    <div className="cp">
      <nav className="cp-steps" aria-label="Campaign steps">
        <div className="cp-track"><motion.div className="cp-track-fill" animate={{ width: `${(step / (STEPS.length - 1)) * 100}%` }} transition={{ duration: .4 }} /></div>
        {STEPS.map(([id, label], i) => {
          const done = i < step && ok(i);
          return (
            <button key={id} className={`cp-step ${i === step ? "on" : ""} ${done ? "done" : ""} ${i < step && !ok(i) ? "warn" : ""}`} onClick={() => goTo(i)} aria-current={i === step ? "step" : undefined}>
              <span className="cp-dot">{done ? <Icon name="check" /> : i + 1}</span>
              <b>{label}</b><span className="help">{summaries[i]}</span>
            </button>
          );
        })}
      </nav>

      <div className="cp-body">
        <div className="card cp-main">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={step} className="cp-pane" initial={{ opacity: 0, x: 24 * dir }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 * dir }} transition={{ duration: .2 }}>
              {step === 0 && <>
                <PaneHead n={1} title="How should people get your message?" sub={waOn ? "Pick one channel, or send on both." : "Messages go out by email from your own account."} />
                <div className="choice-grid">
                  {channels.map(([v, l, ic, d]) => (
                    <button key={v} className={`choice ${mode === v ? "on" : ""}`} onClick={() => { setMode(v); setErrors({}); }}>
                      <span className="choice-top"><span className={`choice-ic ${v}`}><Icon name={ic} /></span><span className={`radio ${mode === v ? "on" : ""}`} /></span>
                      <b>{l}</b><span className="help">{d}</span>
                      <span className={`choice-status ${channelOk[v] ? "ok" : ""}`}><i />{channelOk[v] ? "Connected" : v === "both" ? "Needs both connected" : "Not connected"}</span>
                    </button>))}
                </div>
                {!channelOk[mode] && <Alert tone="warn" style={{ marginTop: 16 }}>
                  {mode !== "email" && wa.state !== "connected" && <>WhatsApp isn't linked: <a href="/app/whatsapp">link it</a>. </>}
                  {mode !== "whatsapp" && !data.profile.has_password && <>Gmail isn't connected: <a href="/app/profile">connect it</a>. </>}
                  You can still do a test run.</Alert>}
              </>}

              {step === 1 && <>
                <PaneHead n={2} title="Who should receive it?" sub="People who replied, bounced or were already contacted are left out automatically." />
                <div className="choice-grid two">
                  <button className={`choice row ${who === "all" ? "on" : ""}`} onClick={() => setWho("all")}>
                    <span className="choice-ic"><Icon name="users" /></span><span className="grow"><b>Everyone not yet contacted</b><span className="help">From your {data.recipients.length} contacts</span></span><span className={`radio ${who === "all" ? "on" : ""}`} /></button>
                  <button className={`choice row ${who === "selected" ? "on" : ""}`} onClick={() => setWho("selected")}>
                    <span className="choice-ic"><Icon name="check" /></span><span className="grow"><b>Only people I selected</b><span className="help">{selected.size ? `${selected.size} selected on Contacts` : "None selected yet"}</span></span><span className={`radio ${who === "selected" ? "on" : ""}`} /></button>
                </div>
                <div className="aud-stats">
                  <div><b>{audience.length}</b><span>ready</span></div>
                  <div className="hl"><b>{going}</b><span>in this run</span></div>
                  <div><b>{pool.length - audience.length}</b><span>left out</span></div>
                </div>
                {errors.who && <Alert tone="warn" style={{ marginTop: 12 }}>{errors.who} {who === "selected" && <a href="/app/contacts">Go to Contacts</a>}</Alert>}
                {audience.length > 0 && <div className="aud-list">
                  {audience.slice(0, 6).map((r, i) => <motion.div key={r.id} className="aud-row" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0, transition: { delay: i * .03 } }}>
                    <span className="avatar">{initials(r.name || r.company || r.email)}</span><div className="t"><b>{r.name || r.email || r.phone}</b><span className="help">{[r.company, mode === "whatsapp" ? r.phone : r.email].filter(Boolean).join(" · ")}</span></div></motion.div>)}
                  {audience.length > 6 && <div className="help aud-more">+ {audience.length - 6} more</div>}
                </div>}
                <div className="opt-row"><Switch checked={resend} onChange={setResend}>Also include people I've already contacted</Switch></div>
              </>}

              {step === 2 && <>
                <PaneHead n={3} title="Write your message" sub="Fields like {name} are filled in for each person. The preview updates as you type." />
                {data.templates.length > 0 && <div className="tpl-strip">
                  <span className="help">Start from</span>
                  {data.templates.map(t => <button key={t.id} className={`tpl-chip ${t.id === tplId ? "on" : ""}`} onClick={() => pickTemplate(t.id)}>{t.name}</button>)}
                </div>}
                {mode !== "whatsapp" && <Field label="Subject" error={errors.subject}><input className="input" value={subject} maxLength={200} placeholder="e.g. Application for Full Stack Engineer – {sender_name}" onChange={e => { setSubject(e.target.value); setErrors(x => ({ ...x, subject: "" })); }} /></Field>}
                <div className="field" style={{ marginTop: 14 }}>
                  <div className="label-row"><label htmlFor="cBody">Message</label><span className="grow" /><span className={`help counter ${body.length > 4500 ? "near" : ""}`}>{body.length.toLocaleString()} / 5,000</span></div>
                  <textarea id="cBody" ref={bodyRef} className="textarea cp-textarea" maxLength={5000} value={body} aria-invalid={errors.body ? "true" : undefined} onChange={e => { setBody(e.target.value); setErrors(x => ({ ...x, body: "" })); }} />
                  {errors.body && <span className="field-error">{errors.body}</span>}
                  <div className="chip-bar"><span className="help">Insert:</span><FieldChips names={fields} onPick={t => setBody(v => insertAt(bodyRef.current, v, t))} /></div>
                </div>
                <button className="link-btn" style={{ marginTop: 10 }} onClick={saveAsTpl}>Save this message as a template</button>
              </>}

              {step === 3 && <>
                <PaneHead n={4} title="Attach files" sub="Tick the files to send with every message. This step is optional." extra={<a className="btn btn-sm" href="/app/files"><Icon name="upload" />Upload</a>} />
                <div className="file-grid">
                  {data.documents.length ? data.documents.map(d => {
                    const on = docs.has(d.name);
                    return <motion.button key={d.name} className={`file-pick ${on ? "on" : ""}`} whileTap={{ scale: .98 }} onClick={() => setDocs(s => { const n = new Set(s); on ? n.delete(d.name) : n.add(d.name); return n; })}>
                      <FileIcon name={d.name} /><span className="grow"><b>{d.name}</b><span className="help">{kb(d.size)}</span></span><span className={`check-box ${on ? "on" : ""}`}>{on && <Icon name="check" />}</span></motion.button>;
                  }) : <div className="empty-inline"><Icon name="file" /><span>No files yet. <a href="/app/files">Upload a resume or brochure</a> to attach it.</span></div>}
                </div>
              </>}

              {step === 4 && <>
                <PaneHead n={5} title="Review and send" sub="Nothing is sent until you press the button below." />
                <div className="review">
                  <ReviewRow icon="zap" label="Channel" value={summaries[0]} onEdit={() => goTo(0)} bad={!dry && !channelOk[mode]} />
                  <ReviewRow icon="users" label="Recipients" value={`${going} ${going === 1 ? "person" : "people"}${audience.length > going ? ` (of ${audience.length} ready)` : ""}`} onEdit={() => goTo(1)} />
                  <ReviewRow icon="message" label={mode === "whatsapp" ? "Message" : "Subject"} value={mode === "whatsapp" ? body.slice(0, 70) : subject} onEdit={() => goTo(2)} />
                  <ReviewRow icon="file" label="Attachments" value={docs.size ? [...docs].join(", ") : "None"} onEdit={() => goTo(3)} />
                  <ReviewRow icon="clock" label="Takes about" value={`${eta} min · ${minD}–${maxD}s between messages`} />
                </div>
                <div className="review-opts">
                  <label className={`opt-card ${dry ? "on" : ""}`}><Switch checked={dry} onChange={setDry} /><span><b>Test run</b><span className="help">Show what would be sent without sending anything</span></span></label>
                  {mode !== "whatsapp" && <label className={`opt-card ${track ? "on" : ""} ${me.can_track_opens ? "" : "off"}`}><Switch checked={track} disabled={!me.can_track_opens} onChange={setTrack} /><span><b>Track opens</b><span className="help">{me.can_track_opens ? "Estimate who opened your email" : "Available once the app has a public address"}</span></span></label>}
                </div>
                <details className="adv">
                  <summary><Icon name="settings" /><b>Pacing &amp; safety</b><span className="help">Max {lim} people · {minD}–{maxD}s gaps</span><Icon name="chevron-down" className="adv-caret" /></summary>
                  <div className="row-3" style={{ marginTop: 14 }}>
                    <Field label="Max people this run" error={errors.limit}><input className="input" type="number" min={1} max={500} value={limit} onChange={e => setLimit(e.target.value)} /></Field>
                    <Field label="Min gap (seconds)" error={errors.min_delay}><input className="input" type="number" min={0} max={3600} value={minD} onChange={e => setMinD(e.target.value)} /></Field>
                    <Field label="Max gap (seconds)" error={errors.max_delay}><input className="input" type="number" min={0} max={3600} value={maxD} onChange={e => setMaxD(e.target.value)} /></Field>
                  </div>
                  <p className="help" style={{ marginTop: 8 }}>WhatsApp waits at least {me.min_wa_delay}s between people. You can send {Math.max(0, me.daily_limit - me.sent_today)} more messages today.</p>
                </details>
                <FormError>{sendError || errors.mode}</FormError>
              </>}
            </motion.div>
          </AnimatePresence>
          <div className="cp-nav">
            {step > 0 ? <Button variant="ghost" icon="arrow-left" onClick={() => goTo(step - 1)}>Back</Button> : <span className="help">Step 1 of 5</span>}
            <span className="grow" />
            {step < 4 ? <Button variant="primary" iconRight="chevron" onClick={() => goTo(step + 1)}>Continue</Button>
              : <Button variant="primary" size="lg" icon="send" disabled={!going} busy={starting} busyLabel="Starting…" onClick={start}>{dry ? `Start test run (${going})` : `Send to ${going} ${going === 1 ? "person" : "people"}`}</Button>}
          </div>
        </div>

        <aside className="cp-side">
          <div className="card cp-preview">
            <div className="card-head"><h3>Preview</h3><span className="grow" />
              {audience.length > 1 && <div className="pv-nav"><Button variant="ghost" size="sm" icon="arrow-left" aria-label="Previous person" onClick={() => setPvIndex(i => (i - 1 + audience.length) % audience.length)} />
                <span className="help">{(pvIndex % audience.length) + 1} of {audience.length}</span><Button variant="ghost" size="sm" icon="chevron" aria-label="Next person" onClick={() => setPvIndex(i => i + 1)} /></div>}
            </div>
            <div className="pv">
              {!sample && <p className="help">Add contacts to see a preview.</p>}
              {mode !== "email" && <div className="wa-pv">
                <div className="wa-top"><span className="av">{initials(sample?.name || sample?.phone || "?")}</span><span>{sample ? (sample.name || sample.company || sample.phone || "Contact") : "Contact"}</span></div>
                <div className="wa-body"><div className="wa-bubble">{pv?.body || "(empty message)"}</div>
                  {[...docs].map(n => <div key={n} className="wa-doc"><FileIcon name={n} /><span>{n}</span></div>)}</div>
              </div>}
              {mode !== "whatsapp" && <div className="mail-pv">
                <div className="mail-h"><div><span>To</span><b>{sample?.email || "—"}</b></div><div><span>Subject</span><b>{pv?.subject || "(no subject)"}</b></div></div>
                <div className="mail-b">{pv?.body || "(empty message)"}</div>
                {docs.size > 0 && <div className="mail-att">{[...docs].map(n => <span key={n} className="a"><FileIcon name={n} />{n}</span>)}</div>}
              </div>}
            </div>
          </div>
          {job.total > 0 && <a className="card last-run" href="/app/activity"><Icon name="activity" /><span className="grow"><b>Last run</b><span className="help">{job.done} of {job.total} done{job.dry_run ? " · test run" : ""}</span></span><Icon name="chevron" /></a>}
        </aside>
      </div>
    </div>
  );
}

const PaneHead = ({ n, title, sub, extra }) => (
  <div className="pane-head"><div className="grow"><span className="pane-kicker">Step {n} of 5</span><h2>{title}</h2>{sub && <p className="help">{sub}</p>}</div>{extra}</div>
);
const ReviewRow = ({ icon, label, value, onEdit, bad }) => (
  <div className={`review-row ${bad ? "bad" : ""}`}><span className="rv-ic"><Icon name={icon} /></span><span className="rv-l">{label}</span><span className="rv-v">{value || "—"}</span>{onEdit && <button className="link-btn" onClick={onEdit}>Edit</button>}</div>
);
