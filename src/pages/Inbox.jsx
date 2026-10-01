import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { on } from "../lib/bus";
import { ago, fmtD, fmtDT, gmailLink } from "../lib/format";
import { go } from "../lib/router";
import { Bar, Doughnut, centerText, useChartTheme } from "../ui/charts";
import { Alert, Avatar, Button, Chips, Drawer, DrawerHead, Empty, Icon, Sk, Switch, fail, modal, toast, useDebounced, Pager, usePager } from "../ui/kit";
import { AppBadge, Kpi, MailSyncLine } from "../ui/shared";

export default function Inbox({ route }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  const [months, setMonths] = useState(12);
  const [cat, setCat] = useState("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("count");
  const [jobOnly, setJobOnly] = useState(false);
  const dq = useDebounced(q);
  const t = useChartTheme();
  const load = useCallback(() => api(`/api/inbox?months=${months}`).then(r => { setD(r); setErr(""); }).catch(e => setErr(e.message)), [months]);
  useEffect(() => { load(); return on("sync-done", load); }, [load]);

  const catOf = k => d?.categories[k] || { label: k, color: "#cbd5e1" };
  const rows = useMemo(() => {
    if (!d) return [];
    let r = d.companies.filter(c => !c.hidden);
    if (cat) r = r.filter(c => c.cats[cat]);
    if (jobOnly) r = r.filter(c => c.job);
    if (dq) r = r.filter(c => c.name.toLowerCase().includes(dq.toLowerCase()) || (c.via || []).join(" ").toLowerCase().includes(dq.toLowerCase()));
    const by = { count: (a, b) => cat ? b.cats[cat] - a.cats[cat] : b.count - a.count, last: (a, b) => b.last - a.last, job: (a, b) => b.job - a.job || b.count - a.count, name: (a, b) => a.name.localeCompare(b.name) }[sort];
    return r.sort(by);
  }, [d, cat, jobOnly, dq, sort]);
  const pg = usePager(rows, [cat, jobOnly, dq, sort, months].join("|"), 25);

  if (err) return <div className="card"><Empty icon="alert" title="Couldn't load your inbox">{err}</Empty></div>;
  if (!d) return <div><div className="kpis four">{[0, 1, 2, 3].map(i => <div key={i} className="kpi sk-card" style={{ height: 104 }} />)}</div><div className="card sk-block" style={{ height: 300 }} /></div>;

  const comps = d.companies.filter(c => !c.hidden && !c.person);
  const job = Object.entries(d.by_category).filter(([k]) => catOf(k).job).reduce((n, [, v]) => n + v, 0);
  const last = d.months.at(-1);
  const thisMonth = last ? Object.entries(last).filter(([k, v]) => k !== "month" && typeof v === "number").reduce((a, [, v]) => a + v, 0) : 0;
  const cats = Object.entries(d.by_category).filter(([, n]) => n).sort((a, b) => b[1] - a[1]);
  const topCats = cats.slice(0, 7).map(([k]) => k);
  const top = rows.filter(c => !c.person).slice(0, 15);
  const order = Object.keys(d.categories);
  const lbl = m => new Date(m + "-01T00:00").toLocaleDateString([], { month: "short", year: "2-digit" });
  const listed = d.companies.filter(c => !c.hidden);

  return (
    <div>
      <MailSyncLine strip />
      <div className="kpis four">
        <Kpi index={0} icon="mail" label="Emails" value={d.total} sub={`${thisMonth} this month`} />
        <Kpi index={1} icon="briefcase" tone="brand" label="Companies" value={comps.length} sub={`${comps.filter(c => c.job).length} about jobs`} />
        <Kpi index={2} icon="trend" tone="teal" label="Job-related" value={d.total ? Math.round(100 * job / d.total) : 0} suffix="%" sub={`${job.toLocaleString()} emails`} />
        <Kpi index={3} icon="calendar" tone="violet" label="Interviews & offers" value={(d.by_category.interview || 0) + (d.by_category.offer || 0)} sub={`${d.by_category.assessment || 0} assessments`} />
      </div>
      {d.total > 0 && <div className="glance-grid">
        <motion.div className="card chart-card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <div className="card-head"><h3>By category</h3><span className="grow" /><span className="help">click to filter</span></div>
          <div className="chart-box tallish"><Doughnut data={{ labels: cats.map(([k]) => catOf(k).label), datasets: [{ data: cats.map(([, n]) => n), backgroundColor: cats.map(([k]) => catOf(k).color), borderColor: t.surface, borderWidth: 3, hoverOffset: 8 }] }}
            options={{ cutout: "64%", plugins: { legend: { position: "bottom", labels: { font: { size: 11 }, padding: 8 } } }, onClick: (e, els) => { if (els[0]) setCat(cats[els[0].index][0]); } }} plugins={[centerText(d.total.toLocaleString(), "emails")]} /></div>
        </motion.div>
        <motion.div className="card chart-card span-2" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .05 }}>
          <div className="card-head"><h3>Emails per month</h3><span className="grow" />
            <select className="select sm" value={months} onChange={e => setMonths(+e.target.value)} aria-label="Period"><option value={3}>3 months</option><option value={6}>6 months</option><option value={12}>12 months</option><option value={24}>2 years</option><option value={0}>All time</option></select></div>
          <div className="chart-box tallish"><Bar data={{ labels: d.months.map(m => lbl(m.month)), datasets: [
            ...topCats.map(k => ({ label: catOf(k).label, data: d.months.map(m => m[k] || 0), backgroundColor: catOf(k).color, stack: "s", maxBarThickness: 34, borderRadius: 3 })),
            { label: "Everything else", data: d.months.map(m => Object.entries(m).filter(([k, v]) => k !== "month" && !topCats.includes(k) && typeof v === "number").reduce((a, [, v]) => a + v, 0)), backgroundColor: "#e2e8f0", stack: "s", maxBarThickness: 34 }] }}
            options={{ interaction: { mode: "index", intersect: false }, scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 }, grid: t.grid } }, plugins: { legend: { position: "bottom", labels: { font: { size: 11 } } } } }} /></div>
        </motion.div>
        <motion.div className="card chart-card span-3" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .1 }}>
          <div className="card-head"><h3>Top companies</h3><span className="grow" /><span className="help">by number of emails · click a bar to open</span></div>
          <div className="chart-box tall"><Bar data={{ labels: top.map(c => c.name.length > 26 ? c.name.slice(0, 25) + "…" : c.name), datasets: [
            ...topCats.map(k => ({ label: catOf(k).label, data: top.map(c => c.cats[k] || 0), backgroundColor: catOf(k).color, stack: "s", maxBarThickness: 18, borderRadius: 3 })),
            { label: "Everything else", data: top.map(c => Object.entries(c.cats).filter(([k]) => !topCats.includes(k)).reduce((a, [, v]) => a + v, 0)), backgroundColor: "#e2e8f0", stack: "s", maxBarThickness: 18 }] }}
            options={{ indexAxis: "y", interaction: { mode: "index", intersect: false }, scales: { x: { stacked: true, beginAtZero: true, ticks: { precision: 0 }, grid: t.grid }, y: { stacked: true, grid: { display: false } } }, plugins: { legend: { position: "bottom", labels: { font: { size: 11 } } } }, onClick: (e, els) => els[0] && go("inbox/" + top[els[0].index].key) }} /></div>
        </motion.div>
      </div>}
      <div className="toolbar">
        <Chips value={cat} onChange={setCat} options={[["", "All companies", listed.length], ...cats.map(([k]) => [k, catOf(k).label, listed.filter(c => c.cats[k]).length, catOf(k).color])]} />
      </div>
      <div className="toolbar">
        <span className="grow" />
        <Switch checked={jobOnly} onChange={setJobOnly}>Job-related only</Switch>
        <div className="search"><Icon name="search" /><input className="input" type="search" placeholder="Search companies…" value={q} onChange={e => setQ(e.target.value)} /></div>
        <select className="select auto" value={sort} onChange={e => setSort(e.target.value)} aria-label="Sort"><option value="count">Most emails</option><option value="last">Latest email</option><option value="job">Most job-related</option><option value="name">A–Z</option></select>
      </div>
      <div className="card table-card">
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Company</th><th>Emails</th><th className="hide-sm">What they send</th><th className="hide-md">Mostly</th><th>Latest</th><th className="hide-md">Application</th></tr></thead>
          <tbody>
            {pg.items.map((c, i) => (
              <motion.tr key={c.key} className={`click ${c.key === route.param ? "on" : ""}`} onClick={() => go("inbox/" + c.key)} initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: Math.min(i, 20) * .012 } }}>
                <td><div className="co"><Avatar name={c.name} logo /><div><b>{c.name}</b><span className="help">{c.person ? "Person" : c.via.length ? "via " + c.via.join(", ") : `${c.senders} sender${c.senders === 1 ? "" : "s"}`}</span></div></div></td>
                <td className="num"><b>{cat ? c.cats[cat] : c.count}</b>{cat && <span className="help block">of {c.count}</span>}</td>
                <td className="hide-sm"><div className="catbar" title={order.filter(k => c.cats[k]).map(k => `${catOf(k).label}: ${c.cats[k]}`).join(" · ")}>
                  {order.filter(k => c.cats[k]).map(k => <motion.i key={k} initial={{ flexGrow: 0 }} animate={{ flexGrow: c.cats[k] }} transition={{ duration: .6 }} style={{ background: catOf(k).color }} />)}</div></td>
                <td className="hide-md"><span className="cat-badge" style={{ "--c": catOf(c.top).color }}>{catOf(c.top).label}</span></td>
                <td className="nowrap">{ago(c.last)}<span className="help block clip" style={{ maxWidth: 260 }}>{c.last_subject}</span></td>
                <td className="hide-md">{c.app ? <a href={`/app/applications/${c.app.id}`} onClick={e => e.stopPropagation()}><AppBadge status={c.app.status} statuses={{}} /></a> : <span className="help">—</span>}</td>
              </motion.tr>))}
            {!d.total && <tr><td colSpan={6}><Empty icon="inbox" title="Nothing here yet" action={<a className="btn btn-sm" href="/app/profile">Mail sync settings</a>}>{d.email_ready ? "Sync your mail to sort your inbox by company." : "Connect Gmail on the Profile page first."}</Empty></td></tr>}
            {d.total > 0 && !rows.length && <tr><td colSpan={6}><Empty icon="search" title="No companies match">Try another category or search.</Empty></td></tr>}
          </tbody></table></div>
        <Pager p={pg} label="companies" />
      </div>
      <Drawer open={!!route.param} onClose={() => go("inbox")} label="Company emails">
        {route.param && <CompanyDetail k={route.param} cats={d.categories} summary={d.companies.find(c => c.key === route.param)} onChanged={load} />}
      </Drawer>
    </div>
  );
}

function CompanyDetail({ k, cats, summary, onChanged }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  const [f, setF] = useState("");
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [f]);
  useEffect(() => { setD(null); api(`/api/inbox/company/${k}`).then(setD).catch(e => setErr(e.message)); }, [k]);
  if (err) return <div className="dr-pad"><Empty icon="alert" title="Couldn't open this company">{err}</Empty></div>;
  if (!d) return <div className="dr-pad"><Sk w="60%" h={22} /><div className="sk-block card" style={{ marginTop: 20 }} /></div>;
  const catOf = x => cats[x] || { label: x, color: "#cbd5e1" };
  const counts = {}; d.items.forEach(i => counts[i.cat] = (counts[i.cat] || 0) + 1);
  const rename = async () => {
    const name = (await modal({ title: "Rename company", text: "Use this if an email system's name shows up instead of the company.", input: d.name, confirm: "Save" }) || "").trim();
    if (!name || name === d.name) return;
    try { await api(`/api/inbox/company/${k}`, { method: "PUT", json: { name } }); setD(x => ({ ...x, name })); toast("Renamed"); onChanged(); } catch (e) { fail(e); }
  };
  const hide = async () => { try { await api(`/api/inbox/company/${k}`, { method: "PUT", json: { hidden: !d.hidden } }); toast(d.hidden ? "Shown again" : "Hidden from the list"); go("inbox"); onChanged(); } catch (e) { fail(e); } };
  const items = d.items.filter(i => !f || i.cat === f);
  const shown = items.slice(0, page * 30);
  return <>
    <DrawerHead logo={<Avatar name={d.name} logo size="lg" />} title={d.name} sub={`${d.items.length} email${d.items.length === 1 ? "" : "s"} · first ${fmtD(new Date(d.items.at(-1).ts * 1000).toISOString())} · latest ${ago(d.items[0].ts)}`} onClose={() => go("inbox")} />
    <div className="dr-pad">
      <Chips value={f} onChange={setF} options={[["", "All", d.items.length], ...Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([x, n]) => [x, catOf(x).label, n, catOf(x).color])]} />
      {summary?.app && <a className="app-callout" href={`/app/applications/${summary.app.id}`}><Alert style={{ marginTop: 14 }}>You applied here{summary.app.role ? <> for <b>{summary.app.role}</b></> : ""}. Status: <b>{summary.app.status}</b>. Open application →</Alert></a>}
      <div className="form-actions"><Button size="sm" icon="note" onClick={rename}>Rename</Button><Button size="sm" variant="ghost" onClick={hide}>{d.hidden ? "Show in list" : "Hide from list"}</Button></div>
      <h4 className="dr-sub">Emails</h4>
      <ol className="mail-list">
        <AnimatePresence initial={false}>
          {shown.map((i, n) => (
            <motion.li key={i.msgid + n} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0, transition: { delay: Math.min(n, 12) * .025 } }} exit={{ opacity: 0 }}>
              <div className="tl-top"><span className="cat-badge" style={{ "--c": catOf(i.cat).color }}>{catOf(i.cat).label}</span><span className="help">{fmtDT(new Date(i.ts * 1000).toISOString())}</span></div>
              <b>{i.subject || "(no subject)"}</b><span className="help">{i.from || i.addr} · {i.addr}</span>
              {i.snippet && <p className="tl-note">{i.snippet}</p>}
              <a className="help" target="_blank" rel="noopener noreferrer" href={gmailLink(i.msgid)}>Open in Gmail ↗</a>
            </motion.li>))}
        </AnimatePresence>
      </ol>
      {items.length > shown.length && <div className="more-row"><Button onClick={() => setPage(x => x + 1)}>Show {Math.min(30, items.length - shown.length)} more of {items.length - shown.length}</Button></div>}
    </div>
  </>;
}
