import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { ago, localInput } from "../lib/format";
import { replacePath } from "../lib/router";
import { useApp } from "../lib/store";
import { Alert, Avatar, Button, Empty, Field, FormError, Icon, SkBlock, applyError, fail, modal, toast } from "../ui/kit";

const LINKS = [["home", "Feed", "https://www.linkedin.com/feed/"], ["message", "Messages", "https://www.linkedin.com/messaging/"], ["user", "Edit profile", "https://www.linkedin.com/in/me/"],
  ["zap", "Recommended jobs", "https://www.linkedin.com/jobs/collections/recommended/"], ["star", "Saved jobs", "https://www.linkedin.com/jobs/tracker/saved/"],
  ["search", "Jobs posted today", "https://www.linkedin.com/jobs/search/?keywords=hiring&f_TPR=r86400"],
  ["message", "Hiring posts (24 h)", "https://www.linkedin.com/search/results/content/?keywords=%22hiring%22%20%22send%20your%20resume%22&datePosted=%22past-24h%22&sortBy=%22date_posted%22"]];

export default function LinkedIn({ route }) {
  const app = useApp();
  const [s, setS] = useState(null);
  const [err, setErr] = useState("");
  const load = () => api("/api/li/status").then(r => { setS(r); app.setLinks(l => ({ ...l, linkedin: r.connected })); }).catch(e => setErr(e.message));
  useEffect(() => {
    if (route.query.get("error")) toast(route.query.get("error"), true);
    if (route.query.get("connected")) toast("LinkedIn connected");
    if (route.query.toString()) replacePath("linkedin");
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (err) return <div className="card"><Empty icon="alert" title="Couldn't load LinkedIn">{err}</Empty></div>;
  if (!s) return <SkBlock h={320} />;
  const links = (
    <motion.div className="card card-pad" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .08 }}>
      <h3 className="sec-h"><Icon name="external" />Open on LinkedIn</h3>
      <p className="help" style={{ marginBottom: 12 }}>LinkedIn doesn't let other apps read your feed or messages, edit your profile or apply to jobs, so these open LinkedIn directly.</p>
      <div className="link-grid">{LINKS.map(([ic, l, h]) => <motion.a key={l} className="btn" target="_blank" rel="noopener noreferrer" href={h} whileHover={{ y: -2 }}><Icon name={ic} />{l}</motion.a>)}</div>
      <p className="help" style={{ marginTop: 12 }}>Found a post asking for CVs by email? Send it to <a href="/app/posts">Hiring posts</a>. Job-alert emails from LinkedIn show up in <a href="/app/jobs">Job matches</a>.</p>
    </motion.div>
  );
  if (!s.configured) return <div className="split"><Setup s={s} onSaved={load} />{links}</div>;
  if (!s.connected) return (
    <div className="split">
      <motion.div className="card card-pad connect-card" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <motion.div className="connect-ic li" initial={{ scale: .5 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 260, damping: 14 }}><Icon name="linkedin" /></motion.div>
        <h3>{s.expired ? "Your LinkedIn sign-in expired" : "Connect your LinkedIn account"}</h3>
        <p className="help">You'll sign in on LinkedIn's own page. Reachout gets permission to see your name, photo and email, and to publish posts you write here. It can't read your messages or change your profile.</p>
        <a className="btn btn-primary btn-lg" href="/api/li/connect" style={{ marginTop: 16 }}><Icon name="linkedin" />Continue with LinkedIn</a>
      </motion.div>
      {links}
    </div>
  );
  const p = s.profile, exp = s.expires_at ? Math.max(0, Math.round((s.expires_at * 1000 - Date.now()) / 864e5)) : null;
  return (
    <div className="split">
      <div className="col">
        <motion.div className="card li-profile" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          {p.picture ? <img src={p.picture} alt="" /> : <Avatar name={p.name} size="xl" />}
          <div className="t"><b>{p.name}</b><span className="help">{p.email}</span><span className="help">Connected{exp != null && ` · sign-in valid for ${exp} more day${exp === 1 ? "" : "s"}`}</span></div>
          <span className="grow" />
          <div className="form-actions" style={{ margin: 0 }}><a className="btn btn-sm" target="_blank" rel="noopener noreferrer" href="https://www.linkedin.com/in/me/"><Icon name="external" />View profile</a>
            <Button size="sm" variant="ghost" onClick={async () => { if (!await modal({ title: "Disconnect LinkedIn?", text: "Scheduled posts won't be published.", confirm: "Disconnect", danger: true })) return; await api("/api/li/disconnect", { json: {} }).catch(fail); load(); }}>Disconnect</Button></div>
        </motion.div>
        {s.can_post ? <Composer onDone={load} /> : (
          <div className="card card-pad">
            <Alert tone="warn"><b>Signed in, but posting isn't enabled.</b> Your LinkedIn app doesn't have the <b>Share on LinkedIn</b> product yet.</Alert>
            <ol className="howto"><li>Open <a href="https://www.linkedin.com/developers/apps" target="_blank" rel="noopener noreferrer">linkedin.com/developers/apps</a> → your app → <b>Products</b>.</li><li>Next to <b>Share on LinkedIn</b>, click <b>Request access</b>.</li><li>Come back and click <b>Reconnect</b>.</li></ol>
            <a className="btn btn-primary" href="/api/li/connect?share=1"><Icon name="linkedin" />Reconnect with posting</a>
          </div>)}
      </div>
      <div className="col">
        <div className="card"><div className="card-head"><h3>Posted from Reachout</h3><span className="grow" /><a className="btn btn-sm btn-ghost" href="/app/posts">Scheduled</a></div>
          {s.posts.length ? s.posts.map((x, i) => <motion.div key={i} className="li-post" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * .04 }}>
            <p>{x.text.slice(0, 280)}{x.text.length > 280 && "…"}</p><span className="help">{ago(x.at)} · {x.visibility === "PUBLIC" ? "Anyone" : "Connections"}{x.url && <> · <a href={x.url} target="_blank" rel="noopener noreferrer">View on LinkedIn</a></>}</span></motion.div>)
            : <Empty icon="linkedin" title="No posts yet">Posts you publish from Reachout appear here.</Empty>}
        </div>
        {links}
      </div>
    </div>
  );
}

function Setup({ s, onSaved }) {
  const [v, setV] = useState({ client_id: "", client_secret: "" });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const save = async e => {
    e.preventDefault(); setErrors({});
    if (!v.client_id.trim()) return setErrors({ client_id: "Paste the Client ID." });
    if (!v.client_secret.trim()) return setErrors({ client_secret: "Paste the Client Secret." });
    setBusy(true);
    try { await api("/api/li/config", { method: "PUT", json: { client_id: v.client_id.trim(), client_secret: v.client_secret.trim() } }); toast("LinkedIn app saved. Now connect your account."); onSaved(); }
    catch (er) { applyError(er, setErrors); }
    setBusy(false);
  };
  return (
    <motion.form className="card card-pad connect-card" onSubmit={save} noValidate initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <div className="connect-ic li"><Icon name="linkedin" /></div>
      <h3>{s.is_admin ? "Set up LinkedIn for this site" : "LinkedIn isn't set up yet"}</h3>
      {s.is_admin ? <>
        <p className="help">A one-time step for the site owner: register a free LinkedIn app so people can connect their accounts.</p>
        <ol className="howto">
          <li>Go to <a href="https://www.linkedin.com/developers/apps/new" target="_blank" rel="noopener noreferrer">linkedin.com/developers/apps/new</a> and create an app.</li>
          <li>On <b>Products</b>, add <b>Sign In with LinkedIn using OpenID Connect</b> and <b>Share on LinkedIn</b>.</li>
          <li>On <b>Auth</b>, add this redirect URL: <code>{s.redirect_uri}</code></li>
          <li>Copy the <b>Client ID</b> and <b>Primary Client Secret</b> here.</li>
        </ol>
        <div className="row-2">
          <Field label="Client ID" error={errors.client_id}><input className="input" autoComplete="off" value={v.client_id} onChange={e => setV(x => ({ ...x, client_id: e.target.value }))} /></Field>
          <Field label="Client Secret" error={errors.client_secret}><input className="input" type="password" autoComplete="off" value={v.client_secret} onChange={e => setV(x => ({ ...x, client_secret: e.target.value }))} /></Field>
        </div>
        <div className="form-actions"><span className="help">Stored encrypted.</span><span className="grow" /><Button type="submit" variant="primary" busy={busy}>Save</Button></div>
      </> : <p className="help">Ask the site owner to set up the LinkedIn app. Meanwhile you can use the links alongside.</p>}
    </motion.form>
  );
}

function Composer({ onDone }) {
  const [text, setText] = useState("");
  const [vis, setVis] = useState("PUBLIC");
  const [when, setWhen] = useState("now");
  const [at, setAt] = useState("");
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async e => {
    e.preventDefault(); setErrors({}); setFormError("");
    if (!text.trim()) return setErrors({ text: "Write something to post." });
    const data = { text: text.trim(), visibility: vis };
    if (when === "custom") { if (!at || new Date(at) < new Date()) return setErrors({ send_at: "Pick a time in the future." }); data.send_at = at; }
    if (when === "morning") { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 30, 0, 0); data.send_at = localInput(d); }
    if (when === "60") data.delay_minutes = 60;
    if (when === "now" && !await modal({ title: "Publish this post now?", text: vis === "PUBLIC" ? "Anyone on LinkedIn will be able to see it." : "Your connections will see it.", confirm: "Publish" })) return;
    setBusy(true);
    try {
      if (when === "now") { const r = await api("/api/li/post", { json: data }); toast("Posted to LinkedIn"); if (r.url) window.open(r.url, "_blank", "noopener"); }
      else { const r = await api("/api/li/schedule", { json: data }); toast(`Scheduled for ${new Date(r.due * 1000).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })}`); }
      setText(""); onDone();
    } catch (er) { applyError(er, setErrors, setFormError); }
    setBusy(false);
  };
  return (
    <motion.form className="card card-pad" onSubmit={submit} noValidate initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .05 }}>
      <h3 className="sec-h"><Icon name="note" />Write a post</h3>
      <Field error={errors.text}><textarea className="textarea" rows={9} maxLength={3000} placeholder="Share what you're working on, a project you shipped, or that you're open to new roles…" value={text} onChange={e => setText(e.target.value)} /></Field>
      <div className="label-row" style={{ marginTop: 6 }}><span className="help">Tip: a short story about a project gets more reach than a list of skills.</span><span className={`help counter ${text.length > 2700 ? "near" : ""}`}>{text.length} / 3,000</span></div>
      <div className="row-2" style={{ marginTop: 12 }}>
        <Field label="Who can see it"><select className="select" value={vis} onChange={e => setVis(e.target.value)}><option value="PUBLIC">Anyone</option><option value="CONNECTIONS">Connections only</option></select></Field>
        <Field label="When" error={errors.send_at}><select className="select" value={when} onChange={e => setWhen(e.target.value)}><option value="now">Post now</option><option value="60">In 1 hour</option><option value="morning">Tomorrow 9:30 am</option><option value="custom">Pick a time…</option></select></Field>
      </div>
      {when === "custom" && <Field label="Date and time" style={{ marginTop: 10 }}><input className="input" type="datetime-local" value={at} onChange={e => setAt(e.target.value)} /></Field>}
      <FormError>{formError}</FormError>
      <div className="form-actions"><span className="grow" /><Button type="submit" variant="primary" icon="send" busy={busy} busyLabel={when === "now" ? "Posting…" : "Scheduling…"}>{when === "now" ? "Post" : "Schedule post"}</Button></div>
    </motion.form>
  );
}
