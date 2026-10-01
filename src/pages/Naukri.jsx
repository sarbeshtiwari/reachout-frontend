import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { fmtD, safeHref } from "../lib/format";
import { useApp } from "../lib/store";
import { Avatar, Button, Empty, Field, FormError, Icon, SkBlock, fail, modal, toast } from "../ui/kit";
import { AppBadge, Kpi, MailSyncLine, startSync } from "../ui/shared";

export default function Naukri() {
  const app = useApp();
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  const [url, setUrl] = useState("");
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const load = () => api("/api/naukri").then(r => { setD(r); app.setLinks(l => ({ ...l, naukri: r.connected })); }).catch(e => setErr(e.message));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (err) return <div className="card"><Empty icon="alert" title="Couldn't load Naukri">{err}</Empty></div>;
  if (!d) return <SkBlock h={320} />;

  const links = (
    <motion.div className="card card-pad" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .08 }}>
      <h3 className="sec-h"><Icon name="external" />Open on Naukri</h3>
      <p className="help" style={{ marginBottom: 12 }}>Naukri doesn't offer an API for job seekers, and signing in to it from another app would break its terms. So Reachout reads the emails Naukri sends you, and these open Naukri directly.</p>
      <div className="link-grid">
        {[["user", "My profile", d.links.profile], ["briefcase", "Applied jobs", d.links.applies], ["zap", "Recommended jobs", d.links.recommended], ["inbox", "Recruiter inbox", d.links.inbox], ["search", "Jobs posted today", d.links.search]].map(([ic, l, h]) => (
          <motion.a key={l} className="btn" target="_blank" rel="noopener noreferrer" href={h} whileHover={{ y: -2 }}><Icon name={ic} />{l}</motion.a>))}
      </div>
    </motion.div>
  );

  if (!d.connected) {
    const connect = async e => {
      e.preventDefault(); setErrors({});
      if (url.trim() && !/^https:\/\/(www\.)?naukri\.com\//.test(url.trim())) return setErrors({ profile_url: "Paste a link that starts with https://www.naukri.com/" });
      setBusy(true);
      try { const r = await api("/api/naukri/connect", { json: { profile_url: url.trim() } }); toast(`Connected. Found ${r.emails_found} Naukri emails; reading them now.`); load(); }
      catch (er) { er.field ? setErrors({ [er.field]: er.message }) : setErrors({ form: er.message }); }
      setBusy(false);
    };
    return (
      <div className="split">
        <motion.form className="card card-pad connect-card" onSubmit={connect} noValidate initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <motion.div className="connect-ic nk" initial={{ scale: .5, rotate: -10 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 260, damping: 14 }}><Icon name="naukri" /></motion.div>
          <h3>Connect Naukri</h3>
          <p className="help">Reachout follows your Naukri activity through the emails Naukri sends: <b>“You applied for…”</b>, <b>“Status of your job application has changed”</b>, recruiter messages and job alerts. They appear in Applications, Job matches and on your dashboard, and update every morning.</p>
          <ol className="howto">
            <li>Make sure your Naukri account uses <b>{app.me.email}</b>{!d.email_ready && <> and <a href="/app/profile">connect Gmail</a> in Reachout</>}.</li>
            <li>On Naukri, go to <a href="https://www.naukri.com/mnjuser/settings" target="_blank" rel="noopener noreferrer">Settings → Communications</a> and keep application-status and job-alert emails on.</li>
            <li>Optionally paste your profile link, then connect.</li>
          </ol>
          <Field label="Naukri profile link" opt="(optional)" error={errors.profile_url}><input className="input" placeholder="https://www.naukri.com/mnjuser/profile" value={url} onChange={e => setUrl(e.target.value)} /></Field>
          <FormError>{errors.form}</FormError>
          <div className="form-actions"><span className="grow" /><Button type="submit" variant="primary" icon="link" disabled={!d.email_ready} busy={busy} busyLabel="Checking your mailbox…">Connect Naukri</Button></div>
        </motion.form>
        {links}
      </div>
    );
  }
  const s = d.stats;
  return (
    <div>
      <div className="kpis four">
        <Kpi index={0} icon="briefcase" label="Applications via Naukri" value={s.applications} sub="from “You applied” emails" />
        <Kpi index={1} icon="eye" tone="brand" label="Recruiter activity" value={s.recruiter_activity} sub="status changes on your applies" />
        <Kpi index={2} icon="zap" tone="violet" href="/app/jobs" label="Jobs from alerts" value={s.job_alerts} sub="See matches" />
        <Kpi index={3} icon="mail" label="Emails found" value={d.emails_found} sub="Naukri emails in your inbox" />
      </div>
      <div className="split">
        <motion.div className="card" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="card-head"><h3>Latest Naukri applications</h3><span className="grow" /><a className="btn btn-sm" href="/app/applications">All applications</a></div>
          {s.recent.length ? <div className="mini-list">{s.recent.map(x => (
            <a key={x.id} className="mini-row" href={`/app/applications/${x.id}`}><Avatar name={x.company} logo /><div className="t"><b>{x.company}</b><span className="help">{x.role}</span></div><AppBadge status={x.status} statuses={{}} /><span className="help nowrap">{fmtD(x.applied_at)}</span></a>))}</div>
            : <Empty icon="naukri" title="No Naukri applications found yet">They appear after the next sync. Apply on Naukri and the confirmation email is picked up automatically.</Empty>}
          <div className="card-foot">
            {d.profile_url && <a className="btn btn-sm" target="_blank" rel="noopener noreferrer" href={safeHref(d.profile_url)}><Icon name="external" />My Naukri profile</a>}
            <MailSyncLine /><span className="grow" />
            <Button size="sm" icon="refresh" onClick={() => startSync(false)}>Sync now</Button>
            <Button size="sm" variant="ghost" onClick={async () => { if (!await modal({ title: "Disconnect Naukri?", text: "Applications already found stay in Applications.", confirm: "Disconnect" })) return; await api("/api/naukri/disconnect", { json: {} }).catch(fail); load(); }}>Disconnect</Button>
          </div>
        </motion.div>
        {links}
      </div>
    </div>
  );
}
