import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { emit, on } from "../lib/bus";
import { ago, fmtD, fmtDT, fmtT, gmailLink, localInput, safeHref } from "../lib/format";
import { go, replacePath } from "../lib/router";
import { Avatar, Button, Chips, Drawer, DrawerHead, Empty, Field, FormError, Icon, Sk, applyError, fail, modal, spring, toast, useDebounced, Pager, usePager } from "../ui/kit";
import { AppBadge, Kpi, MailSyncLine } from "../ui/shared";

export const FILTERS = [
  ["active", "In progress", (a, S) => !S[a.status]?.terminal && a.status !== "incomplete"],
  ["all", "All", () => true],
  ["heard", "Heard back", a => a.status !== "applied"],
  ["interview", "Interviews", a => ["interview", "shortlisted", "assessment"].includes(a.status)],
  ["offer", "Offers", a => a.status === "offer"],
  ["rejected", "Not selected", a => ["rejected", "closed", "withdrawn"].includes(a.status)],
  ["hidden", "Hidden", a => a.hidden],
];

export default function Applications({ route }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState("active");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("updated");
  const [adding, setAdding] = useState(route.query.get("add") === "1");
  const dq = useDebounced(q);
  const openId = route.param;

  const load = useCallback(() => api("/api/apps").then(r => { setD(r); setErr(""); }).catch(e => setErr(e.message)), []);
  useEffect(() => { load(); const offs = [on("apps-changed", load), on("sync-done", load)]; return () => offs.forEach(f => f()); }, [load]);
  const S = d?.statuses || {};
  const apps = d?.apps || [];
  const visible = useMemo(() => {
    const fn = FILTERS.find(x => x[0] === filter)[2];
    const s = dq.toLowerCase();
    let rows = apps.filter(a => (filter === "hidden" ? a.hidden : !a.hidden) && fn(a, S));
    if (s) rows = rows.filter(a => [a.company, a.role, a.job_id, a.portal, S[a.status]?.label].some(v => (v || "").toLowerCase().includes(s)));
    const by = { updated: (a, b) => (b.updated_at || "").localeCompare(a.updated_at || ""), applied: (a, b) => (b.applied_at || "").localeCompare(a.applied_at || ""),
      company: (a, b) => a.company.localeCompare(b.company), status: (a, b) => (S[b.status]?.rank || 0) - (S[a.status]?.rank || 0) || (b.updated_at || "").localeCompare(a.updated_at || "") }[sort];
    return rows.sort(by);
  }, [apps, filter, dq, sort, S]);
  const pg = usePager(visible, [filter, dq, sort].join("|"), 25);
  const live = apps.filter(a => !a.hidden);
  const n = k => live.filter(a => a.status === k).length;
  const heard = live.filter(a => a.status !== "applied").length;

  const exportCsv = () => {
    const cell = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [["Company", "Position", "Job ID", "Applied on", "Applied at", "Status", "Previous status", "Last update", "Interview", "Applied through", "Link", "Notes"],
      ...visible.map(a => [a.company, a.role, a.job_id, fmtD(a.applied_at), fmtT(a.applied_at), S[a.status]?.label, a.prev_status ? S[a.prev_status]?.label : "", fmtD(a.updated_at), a.interview_at ? fmtDT(a.interview_at) : "", a.portal || "Company site", a.url, a.notes])]
      .map(r => r.map(cell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `applications-${new Date().toISOString().slice(0, 10)}.csv` });
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  return (
    <div>
      <MailSyncLine strip />
      <div className="kpis five">
        <Kpi index={0} icon="briefcase" label="Applied" value={live.length} sub={`${live.filter(a => (a.applied_at || "") >= new Date(Date.now() - 7 * 864e5).toISOString()).length} this week`} />
        <Kpi index={1} icon="trend" tone="brand" label="Heard back" value={heard} sub={live.length ? `${Math.round(100 * heard / live.length)}% response rate` : "—"} />
        <Kpi index={2} icon="calendar" tone="teal" label="In process" value={n("assessment") + n("shortlisted") + n("interview") + n("in_review")} sub={`${n("interview")} interview${n("interview") === 1 ? "" : "s"}`} />
        <Kpi index={3} icon="star" tone="ok" label="Offers" value={n("offer")} sub={n("offer") ? "Congratulations!" : "Keep going"} />
        <Kpi index={4} icon="x" tone="bad" label="Not selected" value={n("rejected") + n("closed")} sub={`${n("closed")} positions closed`} />
      </div>
      <div className="toolbar">
        <Chips value={filter} onChange={setFilter} options={FILTERS.filter(([k, , fn]) => k !== "hidden" || apps.some(a => a.hidden)).map(([k, l, fn]) => [k, l, apps.filter(a => (k === "hidden" ? a.hidden : !a.hidden) && fn(a, S)).length])} />
        <span className="grow" />
        <div className="search"><Icon name="search" /><input className="input" type="search" placeholder="Company, role or job ID…" value={q} onChange={e => setQ(e.target.value)} /></div>
        <select className="select auto" value={sort} onChange={e => setSort(e.target.value)} aria-label="Sort"><option value="updated">Latest update</option><option value="applied">Applied date</option><option value="company">Company A–Z</option><option value="status">Status</option></select>
        <Button icon="download" onClick={exportCsv} title="Download as a spreadsheet (CSV)">Export</Button>
        <Button variant="primary" icon="plus" onClick={() => setAdding(true)}>Add</Button>
      </div>
      <div className="card table-card">
        <div className="table-wrap"><table className="table apps-table">
          <thead><tr><th>Company</th><th>Position</th><th>Applied</th><th>Status</th><th className="hide-sm">Previous</th><th className="hide-md">Last update</th><th className="hide-md">Via</th></tr></thead>
          <tbody>
            {!d && !err && Array.from({ length: 8 }, (_, i) => <tr key={i}><td colSpan={7}><div className="co"><Sk w={34} h={34} r={10} /><Sk w={`${30 + (i * 17) % 50}%`} /></div></td></tr>)}
            {err && <tr><td colSpan={7}><Empty icon="alert" title="Couldn't load applications">{err}</Empty></td></tr>}
            <AnimatePresence initial={false}>
              {pg.items.map((a, i) => (
                <motion.tr key={a.id} layout="position" className={`click ${a.id === openId ? "on" : ""}`} tabIndex={0} onClick={() => go("applications/" + a.id)} onKeyDown={e => e.key === "Enter" && go("applications/" + a.id)}
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0, transition: { delay: Math.min(i, 20) * .015 } }} exit={{ opacity: 0 }}>
                  <td><div className="co"><Avatar name={a.company} logo /><div><b>{a.company}</b>{a.job_id && <span className="help mono">{a.job_id}</span>}</div></div></td>
                  <td className="role">{a.role || <span className="help">Not stated</span>}</td>
                  <td className="nowrap">{fmtD(a.applied_at)}<span className="help block">{fmtT(a.applied_at)}</span></td>
                  <td><AppBadge status={a.status} statuses={S} />{a.interview_at && a.status === "interview" && <span className="help iv"><Icon name="calendar" />{fmtDT(a.interview_at)}</span>}</td>
                  <td className="hide-sm">{a.prev_status ? <AppBadge status={a.prev_status} statuses={S} /> : <span className="help">—</span>}</td>
                  <td className="hide-md nowrap">{ago(a.updated_at)}</td>
                  <td className="hide-md"><span className="help">{a.portal || "Company site"}</span></td>
                </motion.tr>))}
            </AnimatePresence>
            {d && !apps.length && <tr><td colSpan={7}><Empty icon="briefcase" title="No applications yet" action={<a className="btn btn-sm" href="/app/profile">Mail sync settings</a>}>{d.email_ready ? "Sync your mail to find the jobs you've applied for, or add one yourself." : "Connect Gmail on the Profile page first."}</Empty></td></tr>}
            {d && apps.length > 0 && !visible.length && <tr><td colSpan={7}><Empty icon="search" title="Nothing matches">Try another filter or search.</Empty></td></tr>}
          </tbody></table></div>
        <Pager p={pg} label="applications" />
      </div>

      <Drawer open={!!openId} onClose={() => replacePath("applications") || go("applications")} label="Application details">
        {openId && <AppDetail id={openId} statuses={S} onChange={a => setD(x => ({ ...x, apps: x.apps.map(y => y.id === a.id ? { ...y, ...a } : y) }))} onDelete={id => { setD(x => ({ ...x, apps: x.apps.filter(y => y.id !== id) })); go("applications"); }} />}
      </Drawer>
      <Drawer open={adding} onClose={() => setAdding(false)} label="Add an application">
        {adding && <AddApp statuses={S} onDone={a => { setAdding(false); if (a) { setD(x => ({ ...x, apps: [a, ...x.apps] })); emit("apps-changed"); } }} />}
      </Drawer>
    </div>
  );
}

function AppDetail({ id, statuses, onChange, onDelete }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  const [v, setV] = useState({});
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState("");
  const load = useCallback(() => api(`/api/apps/${id}`).then(r => { setD(r); setV({ status: r.app.status, company: r.app.company, role: r.app.role, job_id: r.app.job_id, url: r.app.url, notes: r.app.notes }); }).catch(e => setErr(e.message)), [id]);
  useEffect(() => { setD(null); load(); }, [load]);
  if (err) return <div className="dr-pad"><Empty icon="alert" title="Couldn't open this application">{err}</Empty></div>;
  if (!d) return <div className="dr-pad"><Sk w="60%" h={22} /><Sk w="40%" style={{ marginTop: 10 }} /><div className="sk-block card" style={{ marginTop: 20 }} /></div>;
  const a = d.app;
  const steps = ["applied", "in_review", "assessment", "interview", "offer"];
  const at = x => ({ applied: 0, incomplete: 0, in_review: 1, assessment: 2, shortlisted: 2, interview: 3, offer: 4 })[x] ?? -1;
  const end = ["rejected", "closed", "withdrawn"].includes(a.status) ? a.status : "";
  const far = Math.max(0, ...d.history.map(h => at(h.status)));
  const cur = end ? -1 : at(a.status);
  const set = k => e => { setV(x => ({ ...x, [k]: e.target.value })); setErrors(x => ({ ...x, [k]: "" })); };
  const save = async e => {
    e.preventDefault();
    if (!v.company.trim()) return setErrors({ company: "Company can't be empty." });
    const data = { company: v.company, role: v.role, job_id: v.job_id, url: v.url, notes: v.notes };
    if (v.status !== a.status) data.status = v.status;
    setBusy("save");
    try { const r = await api(`/api/apps/${id}`, { method: "PUT", json: data }); onChange(r.app); toast("Saved"); load(); emit("apps-changed"); }
    catch (er) { applyError(er, setErrors); }
    setBusy("");
  };
  const hide = async () => { try { const r = await api(`/api/apps/${id}`, { method: "PUT", json: { hidden: !a.hidden } }); onChange(r.app); toast(r.app.hidden ? "Hidden. Find it under the Hidden filter." : "Shown again"); go("applications"); } catch (e) { fail(e); } };
  const del = async () => {
    if (!await modal({ title: `Delete ${a.company}?`, text: "It won't come back on the next sync unless a new email about it arrives.", confirm: "Delete", danger: true })) return;
    try { await api(`/api/apps/${id}`, { method: "DELETE" }); onDelete(id); toast("Deleted"); } catch (e) { fail(e); }
  };
  return <>
    <DrawerHead logo={<Avatar name={a.company} logo size="lg" />} title={a.company} sub={<>{a.role || "Position not stated"}{a.job_id && <> · <span className="mono">{a.job_id}</span></>}</>} onClose={() => go("applications")} />
    <div className="dr-pad">
      <div className="stepper">
        {steps.map((s, i) => (
          <div key={s} className={`step ${i <= far ? "on" : ""} ${i === cur ? "cur" : ""}`}>
            <motion.i initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: i * .07, ...spring }} />
            <span>{s === "assessment" ? "Assessment / shortlist" : statuses[s]?.label}</span>
          </div>))}
        {end && <div className="step end cur"><motion.i initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: .4, ...spring }} /><span>{statuses[end]?.label}</span></div>}
      </div>
      <div className="dr-facts">
        <div><span className="k">Status</span><AppBadge status={a.status} statuses={statuses} /></div>
        <div><span className="k">Previous</span><AppBadge status={a.prev_status} statuses={statuses} /></div>
        <div><span className="k">Applied</span><b>{fmtD(a.applied_at)}</b><span className="help">{fmtT(a.applied_at)}</span></div>
        <div><span className="k">Last update</span><b>{fmtD(a.updated_at)}</b><span className="help">{ago(a.updated_at)}</span></div>
        <div><span className="k">Applied through</span><b>{a.portal || "Company site"}</b></div>
        <div><span className="k">Contacted you</span><b>{a.contacted ? "Yes" : "Not yet"}</b></div>
        {a.interview_at && <div className="wide"><span className="k">Interview</span><b>{fmtDT(a.interview_at)}</b></div>}
      </div>
      <form onSubmit={save} noValidate>
        <div className="row-2">
          <Field label="Update status"><select className="select" value={v.status} onChange={set("status")}>{Object.entries(statuses).sort((x, y) => x[1].rank - y[1].rank).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}</select></Field>
          <Field label="Job ID"><input className="input" value={v.job_id} maxLength={40} onChange={set("job_id")} /></Field>
          <Field label="Company" error={errors.company}><input className="input" value={v.company} maxLength={80} onChange={set("company")} /></Field>
          <Field label="Position"><input className="input" value={v.role} maxLength={120} onChange={set("role")} /></Field>
        </div>
        <Field label="Job link" opt="(optional)" error={errors.url} style={{ marginTop: 12 }}><input className="input" value={v.url} placeholder="https://…" onChange={set("url")} /></Field>
        <Field label="Notes" style={{ marginTop: 12 }}><textarea className="textarea" rows={3} maxLength={2000} placeholder="Interviewer names, salary discussed, follow-up plans…" value={v.notes} onChange={set("notes")} /></Field>
        <div className="form-actions">
          <Button variant="ghost" size="sm" onClick={hide}>{a.hidden ? "Show again" : "Hide"}</Button>
          <Button variant="ghost" size="sm" className="btn-danger" onClick={del}>Delete</Button>
          <span className="grow" />
          {safeHref(a.url) && <a className="btn btn-sm" href={safeHref(a.url)} target="_blank" rel="noopener noreferrer"><Icon name="external" />Open job</a>}
          <Button type="submit" variant="primary" size="sm" busy={busy === "save"} busyLabel="Saving…">Save</Button>
        </div>
      </form>
      <h4 className="dr-sub">Timeline</h4>
      <ol className="timeline">
        {d.history.slice().reverse().map((h, i) => (
          <motion.li key={i} className={`tl st-${h.status}`} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * .04 }}>
            <span className="tl-dot" />
            <div className="tl-body">
              <div className="tl-top"><AppBadge status={h.status} statuses={statuses} /><span className="help">{fmtDT(h.at)}</span></div>
              <b>{h.subject}</b>{h.from && <span className="help">from {h.from}</span>}
              {h.snippet && <p className="tl-note">{h.snippet}</p>}
              {h.interview_at && <p className="tl-note iv"><Icon name="calendar" />Interview: {fmtDT(h.interview_at)}</p>}
              {h.note && <p className="tl-note warn">{h.note}</p>}
              {h.mid && <a className="help" target="_blank" rel="noopener noreferrer" href={gmailLink(h.mid)}>Open email ↗</a>}
            </div>
          </motion.li>))}
      </ol>
    </div>
  </>;
}

function AddApp({ statuses, onDone }) {
  const [v, setV] = useState({ company: "", role: "", applied_at: localInput(new Date()), status: "applied", job_id: "", portal: "", url: "" });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = k => e => { setV(x => ({ ...x, [k]: e.target.value })); setErrors(x => ({ ...x, [k]: "" })); };
  const submit = async e => {
    e.preventDefault();
    if (!v.company.trim()) return setErrors({ company: "Enter the company name." });
    if (v.url && !/^https?:\/\//.test(v.url)) return setErrors({ url: "Links must start with https://" });
    setBusy(true);
    try { const r = await api("/api/apps", { json: v }); toast("Application added"); onDone(r.app); }
    catch (er) { applyError(er, setErrors, setFormError); }
    setBusy(false);
  };
  return <>
    <DrawerHead logo={<span className="co-logo lg" style={{ "--h": 250 }}><Icon name="plus" /></span>} title="Add an application" sub="For jobs you applied to outside email, like a referral or a walk-in." onClose={() => onDone(null)} />
    <form className="dr-pad" onSubmit={submit} noValidate>
      <div className="row-2">
        <Field label="Company" error={errors.company}><input className="input" value={v.company} maxLength={80} onChange={set("company")} autoFocus /></Field>
        <Field label="Position"><input className="input" value={v.role} maxLength={120} onChange={set("role")} /></Field>
        <Field label="Applied on" error={errors.applied_at}><input className="input" type="datetime-local" value={v.applied_at} onChange={set("applied_at")} /></Field>
        <Field label="Status"><select className="select" value={v.status} onChange={set("status")}>{Object.entries(statuses).sort((x, y) => x[1].rank - y[1].rank).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}</select></Field>
        <Field label="Job ID" opt="(optional)"><input className="input" value={v.job_id} maxLength={40} onChange={set("job_id")} /></Field>
        <Field label="Applied through" opt="(optional)"><input className="input" value={v.portal} maxLength={40} placeholder="Naukri, referral, company site…" onChange={set("portal")} /></Field>
      </div>
      <Field label="Job link" opt="(optional)" error={errors.url} style={{ marginTop: 12 }}><input className="input" value={v.url} placeholder="https://…" onChange={set("url")} /></Field>
      <FormError>{formError}</FormError>
      <div className="form-actions"><span className="grow" /><Button onClick={() => onDone(null)}>Cancel</Button><Button type="submit" variant="primary" busy={busy} busyLabel="Adding…">Add application</Button></div>
    </form>
  </>;
}
